export type RealseeRegion = 'global' | 'cn';

export type ArgusVggtType = 'pinhole' | 'pano';

export type ArgusPollStatus = 'pending' | 'success' | 'failed';

export interface GatewayEnvelope<T> {
  code: number;
  data: T;
  status?: string;
}

export interface AccessTokenRequest {
  app_key: string;
  app_secret: string;
}

export interface AccessTokenData {
  access_token: string;
}

export interface UploadTokenData {
  tmpSecretId: string;
  sessionToken: string;
  tmpSecretKey: string;
  ttl: string;
  prefix: string;
  expire: number;
  app_id: string;
  bucket: string;
  region: string;
  force_path_style?: boolean;
  is_accelerate: string;
  host: string;
  primaryid: string;
  download_type: 'presign' | 'direct';
  download_host: string;
  custom_domain: string;
  custom_scheme: string;
  backup?: unknown;
}

export interface UploadTokenRequest {
  input_image_id: string;
}

export interface UploadTokenResponseData {
  input_image_id: string;
  upload_token: UploadTokenData;
}

export interface TriggerVggtRequest {
  type: ArgusVggtType;
  input_image_id: string;
}

export type TriggerVggtResponseData = Record<string, unknown> | null;

export interface PollVggtRequest {
  type: ArgusVggtType;
  input_image_id: string;
}

export interface PollVggtResponseData {
  status: ArgusPollStatus;
  alg_task_id?: string;
  result_url?: string;
  failed_reason?: string;
}

