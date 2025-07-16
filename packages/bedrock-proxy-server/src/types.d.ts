module 'bedrock-protocol/src/transforms/serializer.js' {
    export function createDeserializer(version: string): {
        parsePacketBuffer: (buffer: Buffer) => any;
        proto: { setVariable(name: 'ShieldItemID', id: string): void };
    };
}