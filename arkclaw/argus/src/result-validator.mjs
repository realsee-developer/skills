import { lstat, open, readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';

const MANIFEST_VERSION = '1.0';
const COORDINATE_SYSTEM = 'right-handed, Y-up';
const EXR_MAGIC = Buffer.from([0x76, 0x2f, 0x31, 0x01]);
const GLB_MAGIC = Buffer.from('glTF');
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp)$/iu;
const MAX_JSON_BYTES = 10 * 1024 * 1024;

/**
 * Validate an already safely extracted Argus output directory and return a
 * JSON-serializable local artifact index. Algorithm manifest version 1.0 is
 * intentionally independent from any local skill/workspace schema version.
 */
export async function validateArgusResult(outputDir, options = {}) {
  const root = resolve(outputDir);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Argus result root must be a regular directory: ${root}`);
  }

  const manifestPath = await assertRegularFile(root, 'output.json', 'output manifest');
  const manifest = await readJsonObject(manifestPath, 'output.json');
  assertString(manifest.version, 'output.json.version');
  if (manifest.version !== MANIFEST_VERSION) {
    throw new Error(
      `Unsupported output.json version "${manifest.version}"; expected "${MANIFEST_VERSION}".`
    );
  }
  if (!['success', 'partial', 'error'].includes(manifest.status)) {
    throw new Error('output.json.status must be "success", "partial", or "error".');
  }

  if (manifest.status === 'error') {
    return validateErrorResult(root, manifestPath, manifest);
  }
  return validateArtifactResult(root, manifestPath, manifest, options);
}

// Lifecycle-facing compatibility name. This preserves the validator as the
// single implementation while returning the local index shape consumed by the
// v2 workspace/result writer.
export async function validateArgusOutput(outputDir, options = {}) {
  const validated = await validateArgusResult(outputDir, options);
  if (validated.status === 'error') {
    return {
      result_status: 'error',
      manifest_path: validated.manifestPath,
      point_cloud_path: null,
      depth_maps: [],
      poses: [],
      intrinsics: [],
      missing_ids: [],
      error: validated.error
    };
  }
  return {
    result_status: validated.status,
    manifest_path: validated.manifestPath,
    point_cloud_path: validated.pointCloud.absolutePath,
    depth_maps: validated.images.map((image) => ({ image_id: image.imageId, ...image.depth })),
    poses: validated.images.map((image) => ({ image_id: image.imageId, ...image.pose })),
    intrinsics: validated.images
      .filter((image) => image.intrinsics)
      .map((image) => ({ image_id: image.imageId, ...image.intrinsics })),
    missing_ids: validated.missingIds,
    error: null
  };
}

async function validateErrorResult(root, manifestPath, manifest) {
  assertOnlyKeys(manifest, ['version', 'status', 'error'], 'error output.json');
  assertPlainObject(manifest.error, 'output.json.error');
  assertNonEmptyString(manifest.error.code, 'output.json.error.code');
  assertNonEmptyString(manifest.error.message, 'output.json.error.message');

  const tree = await walkTree(root);
  const unexpected = tree.filter((entry) => entry.relativePath !== 'output.json');
  if (unexpected.length > 0) {
    throw new Error(
      `Argus error result must not contain artifact files or directories: "${unexpected[0].relativePath}".`
    );
  }
  return {
    version: MANIFEST_VERSION,
    status: 'error',
    outputDir: root,
    manifestPath,
    error: { code: manifest.error.code, message: manifest.error.message },
    images: []
  };
}

async function validateArtifactResult(root, manifestPath, manifest, options) {
  const allowedKeys = [
    'version',
    'status',
    'name_mapping',
    'depth_maps',
    'point_cloud',
    'poses',
    'intrinsics'
  ];
  if (manifest.status === 'partial') allowedKeys.push('missing_ids');
  assertOnlyKeys(manifest, allowedKeys, `${manifest.status} output.json`);

  const nameMapping = validateNameMapping(manifest.name_mapping);
  const allIds = Object.keys(nameMapping).sort(compareUtf8);
  if (allIds.length === 0) {
    throw new Error('output.json.name_mapping must contain at least one input image.');
  }
  if (
    options.expectedImageCount !== undefined &&
    (!Number.isInteger(options.expectedImageCount) || options.expectedImageCount < 1 ||
      allIds.length !== options.expectedImageCount)
  ) {
    throw new Error(
      `output.json.name_mapping contains ${allIds.length} images; expected ${options.expectedImageCount}.`
    );
  }
  validateExpectedInputNames(nameMapping, allIds, options);

  let missingIds = [];
  if (manifest.status === 'partial') {
    if (!Array.isArray(manifest.missing_ids) || manifest.missing_ids.length === 0) {
      throw new Error('Partial output.json requires a non-empty missing_ids array.');
    }
    missingIds = validateUniqueIdArray(manifest.missing_ids, 'output.json.missing_ids');
    assertSubset(new Set(missingIds), new Set(allIds), 'output.json.missing_ids', 'name_mapping');
    if (missingIds.length === allIds.length) {
      throw new Error('Partial output cannot mark every input image as missing; use status "error".');
    }
  } else if (Object.hasOwn(manifest, 'missing_ids')) {
    throw new Error('Successful output.json must not contain missing_ids.');
  }

  const missingSet = new Set(missingIds);
  const successfulIds = allIds.filter((id) => !missingSet.has(id));
  const successfulSet = new Set(successfulIds);
  const expectedFiles = new Set(['output.json']);

  const depthById = await validateDepthMaps(root, manifest.depth_maps, successfulSet, expectedFiles);
  const poseById = await validatePoses(root, manifest.poses, successfulSet, expectedFiles);
  const intrinsicsById = await validateIntrinsics(
    root,
    manifest.intrinsics,
    successfulSet,
    expectedFiles
  );
  const pointCloud = await validatePointCloud(root, manifest.point_cloud, expectedFiles);

  const tree = await walkTree(root);
  const allowedDirectories = new Set(['depth', 'pointcloud', 'pose', 'intrinsics']);
  for (const entry of tree) {
    if (entry.directory) {
      if (!allowedDirectories.has(entry.relativePath)) {
        throw new Error(`Unexpected directory in Argus result: "${entry.relativePath}".`);
      }
      continue;
    }
    if (!expectedFiles.has(entry.relativePath)) {
      throw new Error(`Unexpected file in Argus result: "${entry.relativePath}".`);
    }
  }

  return {
    version: MANIFEST_VERSION,
    status: manifest.status,
    outputDir: root,
    manifestPath,
    nameMapping,
    missingIds,
    pointCloud,
    images: successfulIds.map((imageId) => ({
      imageId,
      sourceFilename: nameMapping[imageId],
      depth: depthById[imageId],
      pose: poseById[imageId],
      ...(intrinsicsById ? { intrinsics: intrinsicsById[imageId] } : {})
    }))
  };
}

function validateNameMapping(value) {
  assertPlainObject(value, 'output.json.name_mapping');
  const result = {};
  const foldedStems = new Map();
  for (const [imageId, filename] of Object.entries(value)) {
    validateImageId(imageId, 'output.json.name_mapping key');
    assertSafeRootImageName(filename, `output.json.name_mapping[${JSON.stringify(imageId)}]`);
    const stem = filename.slice(0, -extname(filename).length);
    const folded = caseFold(stem);
    const prior = foldedStems.get(folded);
    if (prior) {
      throw new Error(`name_mapping contains duplicate or case-folding filename stems: "${prior}" and "${filename}".`);
    }
    foldedStems.set(folded, filename);
    result[imageId] = filename;
  }
  return result;
}

function validateExpectedInputNames(nameMapping, allIds, options) {
  const rawExpected = options.expectedInputNames ?? options.expectedImageNames ?? options.expectedImages;
  if (rawExpected === undefined) return;
  if (!Array.isArray(rawExpected)) {
    throw new Error('expectedInputNames must be an array when provided.');
  }
  const expected = rawExpected.map((value) => {
    const name = typeof value === 'string' ? value : value?.filename ?? value?.name;
    assertSafeRootImageName(name, 'expected input filename');
    return name.normalize('NFC');
  }).sort(compareUtf8);
  const actual = allIds.map((id) => nameMapping[id]);
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error('output.json.name_mapping does not match the validated input filename ordering.');
  }
}

async function validateDepthMaps(root, value, successfulIds, expectedFiles) {
  if (!Array.isArray(value)) throw new Error('output.json.depth_maps must be an array.');
  const byId = {};
  for (const item of value) {
    assertPlainObject(item, 'output.json.depth_maps[]');
    assertOnlyKeys(item, ['image_id', 'path', 'format', 'resolution', 'unit'], 'depth map');
    validateImageId(item.image_id, 'depth_maps[].image_id');
    if (Object.hasOwn(byId, item.image_id)) {
      throw new Error(`Duplicate depth map for image_id "${item.image_id}".`);
    }
    if (item.format !== 'exr') {
      throw new Error(`Depth map "${item.image_id}" must use EXR; PNG depth is not valid in manifest v1.0.`);
    }
    if (item.unit !== 'meter') {
      throw new Error(`Depth map "${item.image_id}" must use unit "meter".`);
    }
    if (
      !Array.isArray(item.resolution) ||
      item.resolution.length !== 2 ||
      !item.resolution.every((part) => Number.isInteger(part) && part > 0)
    ) {
      throw new Error(`Depth map "${item.image_id}" requires positive integer [width, height] resolution.`);
    }
    const expectedPath = `depth/${item.image_id}_depth.exr`;
    if (item.path !== expectedPath) {
      throw new Error(`Depth map "${item.image_id}" must use path "${expectedPath}".`);
    }
    const absolutePath = await assertRegularFile(root, item.path, `depth map ${item.image_id}`);
    await assertMagic(absolutePath, EXR_MAGIC, `depth map ${item.image_id}`);
    expectedFiles.add(item.path);
    byId[item.image_id] = {
      path: item.path,
      absolutePath,
      resolution: [...item.resolution],
      format: 'exr',
      unit: 'meter'
    };
  }
  assertExactIdSet(new Set(Object.keys(byId)), successfulIds, 'depth_maps');
  return byId;
}

async function validatePoses(root, value, successfulIds, expectedFiles) {
  if (!Array.isArray(value)) throw new Error('output.json.poses must be an array.');
  const byId = {};
  for (const item of value) {
    assertPlainObject(item, 'output.json.poses[]');
    assertOnlyKeys(item, ['image_id', 'path', 'format'], 'pose descriptor');
    validateImageId(item.image_id, 'poses[].image_id');
    if (Object.hasOwn(byId, item.image_id)) {
      throw new Error(`Duplicate pose for image_id "${item.image_id}".`);
    }
    if (item.format !== 'json') throw new Error(`Pose "${item.image_id}" must use JSON format.`);
    const expectedPath = `pose/${item.image_id}_pose.json`;
    if (item.path !== expectedPath) {
      throw new Error(`Pose "${item.image_id}" must use path "${expectedPath}".`);
    }
    const absolutePath = await assertRegularFile(root, item.path, `pose ${item.image_id}`);
    const pose = await readJsonObject(absolutePath, item.path);
    assertOnlyKeys(pose, ['image_id', 'rotation', 'translation', 'coordinate_system'], item.path);
    if (pose.image_id !== item.image_id) {
      throw new Error(`${item.path}.image_id must equal "${item.image_id}".`);
    }
    assertMatrix3x3(pose.rotation, `${item.path}.rotation`);
    assertFiniteVector(pose.translation, 3, `${item.path}.translation`);
    assertCoordinateSystem(pose.coordinate_system, `${item.path}.coordinate_system`);
    expectedFiles.add(item.path);
    byId[item.image_id] = { path: item.path, absolutePath, rotation: pose.rotation, translation: pose.translation };
  }
  assertExactIdSet(new Set(Object.keys(byId)), successfulIds, 'poses');
  return byId;
}

async function validateIntrinsics(root, value, successfulIds, expectedFiles) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw new Error('output.json.intrinsics must be an array when present.');
  const byId = {};
  for (const item of value) {
    assertPlainObject(item, 'output.json.intrinsics[]');
    assertOnlyKeys(item, ['image_id', 'path'], 'intrinsics descriptor');
    validateImageId(item.image_id, 'intrinsics[].image_id');
    if (Object.hasOwn(byId, item.image_id)) {
      throw new Error(`Duplicate intrinsics for image_id "${item.image_id}".`);
    }
    const expectedPath = `intrinsics/${item.image_id}_intrinsics.json`;
    if (item.path !== expectedPath) {
      throw new Error(`Intrinsics "${item.image_id}" must use path "${expectedPath}".`);
    }
    const absolutePath = await assertRegularFile(root, item.path, `intrinsics ${item.image_id}`);
    const intrinsics = await readJsonObject(absolutePath, item.path);
    assertOnlyKeys(
      intrinsics,
      ['image_id', 'width', 'height', 'focal_x', 'focal_y', 'principal_x', 'principal_y', 'model'],
      item.path
    );
    if (intrinsics.image_id !== item.image_id) {
      throw new Error(`${item.path}.image_id must equal "${item.image_id}".`);
    }
    for (const field of ['width', 'height']) {
      if (!Number.isInteger(intrinsics[field]) || intrinsics[field] <= 0) {
        throw new Error(`${item.path}.${field} must be a positive integer.`);
      }
    }
    for (const field of ['focal_x', 'focal_y', 'principal_x', 'principal_y']) {
      if (intrinsics[field] !== undefined && !Number.isFinite(intrinsics[field])) {
        throw new Error(`${item.path}.${field} must be a finite number.`);
      }
    }
    if (intrinsics.model !== 'equirectangular') {
      throw new Error(`${item.path}.model must be "equirectangular".`);
    }
    expectedFiles.add(item.path);
    byId[item.image_id] = { path: item.path, absolutePath, ...intrinsics };
  }
  assertExactIdSet(new Set(Object.keys(byId)), successfulIds, 'intrinsics');
  return byId;
}

async function validatePointCloud(root, value, expectedFiles) {
  assertPlainObject(value, 'output.json.point_cloud');
  assertOnlyKeys(
    value,
    ['path', 'format', 'vertex_count', 'has_color', 'has_normals', 'coordinate_system'],
    'point_cloud'
  );
  if (value.path !== 'pointcloud/merged.glb' || value.format !== 'glb') {
    throw new Error('point_cloud must reference "pointcloud/merged.glb" with format "glb".');
  }
  if (!Number.isInteger(value.vertex_count) || value.vertex_count <= 0) {
    throw new Error('point_cloud.vertex_count must be a positive integer.');
  }
  if (typeof value.has_color !== 'boolean' || typeof value.has_normals !== 'boolean') {
    throw new Error('point_cloud.has_color and point_cloud.has_normals must be booleans.');
  }
  assertCoordinateSystem(value.coordinate_system, 'point_cloud.coordinate_system');
  const absolutePath = await assertRegularFile(root, value.path, 'point cloud');
  await assertGlb(absolutePath);
  expectedFiles.add(value.path);
  return {
    path: value.path,
    absolutePath,
    vertexCount: value.vertex_count,
    hasColor: value.has_color,
    hasNormals: value.has_normals,
    coordinateSystem: COORDINATE_SYSTEM
  };
}

async function assertRegularFile(root, relativePath, label) {
  const safePath = assertSafeRelativePath(relativePath, label);
  const absolutePath = resolve(root, ...safePath.split('/'));
  const rel = relative(root, absolutePath);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`${label} escapes the Argus result root.`);
  }

  let current = root;
  for (const part of safePath.split('/')) {
    current = join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`${label} must not traverse a symbolic link: ${safePath}`);
  }
  const stat = await lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must reference a regular file: ${safePath}`);
  }
  return absolutePath;
}

function assertSafeRelativePath(value, label) {
  assertNonEmptyString(value, `${label} path`);
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value)) {
    throw new Error(`${label} path must be a portable relative path: "${value}".`);
  }
  if (CONTROL_CHARACTER.test(value) || value !== value.normalize('NFC')) {
    throw new Error(`${label} path must be control-free NFC Unicode: "${value}".`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} path contains an empty or traversal component: "${value}".`);
  }
  return value;
}

function assertSafeRootImageName(value, label) {
  assertNonEmptyString(value, label);
  if (
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..' ||
    CONTROL_CHARACTER.test(value) ||
    value !== value.normalize('NFC') ||
    !IMAGE_EXTENSION.test(value)
  ) {
    throw new Error(`${label} must be a safe NFC root JPEG/PNG/WebP filename.`);
  }
}

async function assertMagic(path, expected, label) {
  const handle = await open(path, 'r');
  try {
    const actual = Buffer.alloc(expected.length);
    const { bytesRead } = await handle.read(actual, 0, actual.length, 0);
    if (bytesRead !== expected.length || !actual.equals(expected)) {
      throw new Error(`${label} has invalid file magic.`);
    }
  } finally {
    await handle.close();
  }
}

async function assertGlb(path) {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || !header.subarray(0, 4).equals(GLB_MAGIC)) {
      throw new Error('point cloud has invalid GLB magic.');
    }
    if (header.readUInt32LE(4) !== 2) {
      throw new Error('point cloud must be GLB version 2.');
    }
    if (header.readUInt32LE(8) !== stat.size) {
      throw new Error('point cloud GLB declared length does not match its local file size.');
    }
  } finally {
    await handle.close();
  }
}

async function readJsonObject(path, label) {
  const stat = await lstat(path);
  if (stat.size > MAX_JSON_BYTES) throw new Error(`${label} exceeds the JSON size limit.`);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  assertPlainObject(parsed, label);
  return parsed;
}

async function walkTree(root, current = root) {
  const result = [];
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    const rel = relative(root, absolutePath).split(sep).join('/');
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) throw new Error(`Argus result contains symbolic link: "${rel}".`);
    if (stat.isDirectory()) {
      result.push({ relativePath: rel, directory: true });
      result.push(...await walkTree(root, absolutePath));
    } else if (stat.isFile()) {
      result.push({ relativePath: rel, directory: false });
    } else {
      throw new Error(`Argus result contains special file: "${rel}".`);
    }
  }
  return result;
}

function validateImageId(value, label) {
  if (typeof value !== 'string' || !/^\d{6}$/u.test(value)) {
    throw new Error(`${label} must be a six-digit zero-padded image ID.`);
  }
}

function validateUniqueIdArray(value, label) {
  const seen = new Set();
  const result = [];
  for (const id of value) {
    validateImageId(id, `${label}[]`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate image ID "${id}".`);
    seen.add(id);
    result.push(id);
  }
  return result;
}

function assertExactIdSet(actual, expected, label) {
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  if (missing.length || extra.length) {
    throw new Error(
      `${label} image IDs do not match successful inputs; missing=[${missing}], extra=[${extra}].`
    );
  }
}

function assertSubset(actual, expected, label, expectedLabel) {
  const invalid = [...actual].filter((id) => !expected.has(id));
  if (invalid.length) throw new Error(`${label} contains IDs absent from ${expectedLabel}: ${invalid.join(', ')}.`);
}

function assertMatrix3x3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be a 3x3 matrix.`);
  for (let row = 0; row < 3; row += 1) assertFiniteVector(value[row], 3, `${label}[${row}]`);
}

function assertFiniteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    throw new Error(`${label} must contain ${length} finite numbers.`);
  }
}

function assertCoordinateSystem(value, label) {
  if (value !== COORDINATE_SYSTEM) {
    throw new Error(`${label} must be exactly "${COORDINATE_SYSTEM}".`);
  }
}

function assertOnlyKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported field "${unexpected[0]}".`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function caseFold(value) {
  return value.normalize('NFC').toLocaleLowerCase('und');
}
