import "server-only";
import crypto from "node:crypto";
import { Client as SshClient, type ConnectConfig } from "ssh2";
import type { Duplex } from "node:stream";

export type SshTunnelConfig = {
  host:string; port:number; username:string; password:string; hostFingerprint?:string|null;
};

function fingerprint(key: Buffer) {
  return `SHA256:${crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

function normalizeSshHost(value: string) {
  const host = value.trim();
  if (!/^\d{12}$/.test(host)) return host;
  const octets = host.match(/.{3}/g)?.map(Number) || [];
  return octets.length === 4 && octets.every((octet) => octet <= 255)
    ? octets.join(".")
    : host;
}

export async function openSshForward(config:SshTunnelConfig, targetHost:string, targetPort:number) {
  const ssh = new SshClient();
  const host = normalizeSshHost(config.host);
  const expected = config.hostFingerprint?.trim().replace(/=+$/, "") || "";
  const connectConfig:ConnectConfig = {
    host, port:config.port, username:config.username, password:config.password,
    readyTimeout:10_000, keepaliveInterval:10_000, keepaliveCountMax:3,
    hostVerifier: expected ? (key:Buffer) => fingerprint(key) === expected : undefined,
  };
  await new Promise<void>((resolve,reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => finish(() => {
      ssh.destroy();
      reject(new Error(`SSH_CONNECTION_TIMEOUT: ${host}:${config.port} não respondeu em 12 segundos`));
    }), 12_000);
    const fail=(error:Error)=>finish(() => reject(new Error(`SSH_CONNECTION_FAILED: ${error.message}`)));
    ssh.once("ready",() => finish(resolve)).once("error",fail).connect(connectConfig);
  });
  try {
    const stream = await new Promise<Duplex>((resolve,reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => finish(() => reject(new Error(
        `SSH_FORWARD_TIMEOUT: o servidor SSH não alcançou ${targetHost}:${targetPort} em 10 segundos`,
      ))), 10_000);
      ssh.forwardOut("127.0.0.1",0,targetHost,targetPort,(error,channel) => finish(() => error
        ? reject(new Error(`SSH_FORWARD_FAILED: ${error.message}`))
        : resolve(channel)));
    });
    return { stream, close:async()=>{ stream.destroy(); ssh.end(); } };
  } catch (error) { ssh.end(); throw error; }
}
