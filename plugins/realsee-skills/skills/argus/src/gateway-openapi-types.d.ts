export type RealseeRegion = 'global' | 'cn';
export type ArgusTaskStatusCode = 0 | 1 | 2 | 3;
export type ArgusTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface GatewayEnvelope<T> {
  request_id: string;
  trace_id: string;
  business_code: string;
  osi_request_id: string;
  code: number;
  status: string;
  data: T | null;
  cost: number;
}

export interface AccessTokenRequest {
  app_key: string;
  app_secret: string;
}

export interface AccessTokenData {
  access_token: string;
  expire_at: number;
}

export interface ArgusFileTokenData {
  tmpSecretId: string;
  sessionToken: string;
  tmpSecretKey: string;
  ttl: number;
  prefix: string;
  expire: number;
  app_id: string;
  bucket: string;
  region: string;
  is_accelerate: string | boolean;
  host: string;
  download_type: 'presign' | 'direct';
  download_host: string;
  custom_domain: string;
  custom_scheme: string;
  backup?: ArgusFileTokenData | null;
}

export interface ArgusTaskSubmitRequest {
  private_cos_keys: string[];
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
  /** Empty until the task succeeds. */
  output_url: string;
  expiration_timestamp: number;
  error_message: string;
  create_timestamp: number;
  modify_timestamp: number;
}
