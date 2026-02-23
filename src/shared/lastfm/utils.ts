import crypto from 'crypto';

export function buildSig(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'format')
    .sort()
    .map((k) => k + params[k])
    .join('');
  return crypto.createHash('md5').update(sorted + secret, 'utf8').digest('hex');
}
