import axios from 'axios';
import { config } from '../config';
import { buildSig } from './utils';

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const REQUEST_TIMEOUT_MS = 10_000;

export async function getToken(): Promise<string> {
  const res = await axios.get(LASTFM_API_URL, {
    params: {
      method: 'auth.getToken',
      api_key: config.lastfmApiKey,
      format: 'json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (res.data.error) {
    throw new Error(`Last.fm getToken error ${res.data.error}: ${res.data.message}`);
  }
  return res.data.token as string;
}

export async function getSession(token: string): Promise<{ username: string; sessionKey: string }> {
  const params: Record<string, string> = {
    method: 'auth.getSession',
    api_key: config.lastfmApiKey,
    token,
  };
  const api_sig = buildSig(params, config.lastfmApiSecret);
  const res = await axios.get(LASTFM_API_URL, {
    params: { ...params, api_sig, format: 'json' },
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (res.data.error) {
    throw new Error(`Last.fm getSession error ${res.data.error}: ${res.data.message}`);
  }
  return {
    username: res.data.session.name as string,
    sessionKey: res.data.session.key as string,
  };
}
