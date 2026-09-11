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

export async function openSshForward(config:SshTunnelConfig, targetHost:string, targetPort:number) {
  const ssh = new SshClient();
  const expected = config.hostFingerprint?.trim().replace(/=+$/, "") || "";
  const connectConfig:ConnectConfig = {
    host:config.host, port:config.port, username:config.username, password:config.password,
    readyTimeout:10_000, keepaliveInterval:10_000, keepaliveCountMax:3,
    hostVerifier: expected ? (key:Buffer) => fingerprint(key) === expected : undefined,
  };
  await new Promise<void>((resolve,reject) => {
    const fail=(error:Error)=>reject(new Error(`SSH_CONNECTION_FAILED: ${error.message}`));
    ssh.once("ready",resolve).once("error",fail).connect(connectConfig);
  });
  try {
    const stream = await new Promise<Duplex>((resolve,reject) => {
      ssh.forwardOut("127.0.0.1",0,targetHost,targetPort,(error,channel) => error ? reject(new Error(`SSH_FORWARD_FAILED: ${error.message}`)) : resolve(channel));
    });
    return { stream, close:async()=>{ stream.destroy(); ssh.end(); } };
  } catch (error) { ssh.end(); throw error; }
}
