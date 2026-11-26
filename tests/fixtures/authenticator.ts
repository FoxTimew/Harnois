import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest();
/** A real P-256 signature/CBOR authenticator. The production verifier is never mocked. */
export function authenticator() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const jwk = publicKey.export({ format: "jwk" });
  const id = randomBytes(32);
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, "base64url")],
      [-3, Buffer.from(jwk.y!, "base64url")],
    ]),
  );
  function authData(counter: number, flags: number, rpId = "localhost") {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    return Buffer.concat([hash(rpId), Buffer.from([flags]), count]);
  }
  function client(type: string, challenge: string, origin: string) {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin, crossOrigin: false }),
    );
  }
  return {
    id: id.toString("base64url"),
    registration(
      challenge: string,
      options: {
        origin?: string;
        rpId?: string;
        counter?: number;
        flags?: number;
      } = {},
    ) {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(id.length);
      const data = Buffer.concat([
        authData(options.counter ?? 0, options.flags ?? 0x41, options.rpId),
        Buffer.alloc(16),
        length,
        id,
        cose,
      ]);
      const object = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, string>>([
          ["fmt", "none"],
          ["authData", data],
          ["attStmt", new Map()],
        ]),
      );
      return {
        id: id.toString("base64url"),
        rawId: id.toString("base64url"),
        type: "public-key" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: client(
            "webauthn.create",
            challenge,
            options.origin ?? "http://localhost:3000",
          ).toString("base64url"),
          attestationObject: Buffer.from(object).toString("base64url"),
          transports: ["usb", "hybrid"],
        },
      };
    },
    assertion(
      challenge: string,
      options: {
        origin?: string;
        rpId?: string;
        counter?: number;
        flags?: number;
        userHandle?: string;
      } = {},
    ) {
      const data = authData(
        options.counter ?? 0,
        options.flags ?? 1,
        options.rpId,
      );
      const clientData = client(
        "webauthn.get",
        challenge,
        options.origin ?? "http://localhost:3000",
      );
      const signature = sign(
        "sha256",
        Buffer.concat([data, hash(clientData)]),
        privateKey,
      );
      return {
        id: id.toString("base64url"),
        rawId: id.toString("base64url"),
        type: "public-key" as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData.toString("base64url"),
          authenticatorData: data.toString("base64url"),
          signature: signature.toString("base64url"),
          ...(options.userHandle ? { userHandle: options.userHandle } : {}),
        },
      };
    },
  };
}
