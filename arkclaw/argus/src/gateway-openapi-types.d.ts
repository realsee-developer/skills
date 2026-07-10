export type RealseeRegion = 'global' | 'cn';
export type ArgusTaskStatusCode = 0 | 1 | 2 | 3;
export type ArgusTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface GatewayEnvelope<T> {
  code: number | string;
  data: T;
  status?: string;
  message?: string;
  request_id?: string;
}

export interface AccessTokenRequest {
  app_key: string;
  app_secret: string;
}

export interface AccessTokenData {
  access_token: string;
}

export interface ArgusFileTokenData {
  tmpSecretId: string;
  sessionToken: string;
  tmpSecretKey: string;
  ttl: number | string;
  prefix: string;
  expire: number;
  app_id: string;
  bucket: string;
  region: string;
  is_accelerate: string;
  host: string;
  download_type: 'presign' | 'direct';
  download_host: string;
  custom_domain: string;
  custom_scheme: string;
  backup?: ArgusFileTokenData | null;
}

export interface ArgusTaskSubmitRequest {
  private_cos_key: string;
  title: string;
}

export interface ArgusTaskSubmitData {
  task_code: string;
}

export interface ArgusTaskInfoRequest {
  task_code: string;
}

export interface ArgusTaskInfoData {
  status: ArgusTaskStatusCode;
  output_url?: string;
  expiration_timestamp?: number;
  error_message?: string;
  create_timestamp?: number;
  modify_timestamp?: number;
  path?: string;
  md5?: string;
  size?: number;
}
