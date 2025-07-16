const BlockFace = {
    UNKNOWN: -999,
    BOTTOM: 0,
    TOP: 1,
    NORTH: 2,
    SOUTH: 3,
    WEST: 4,
    EAST: 5,
};

export class RaycastIterator {
    pos: any;
    dir: any;
    invDirX: any;
    invDirY: any;
    invDirZ: any;
    stepX: any;
    stepY: any;
    stepZ: any;
    tDeltaX: any;
    tDeltaY: any;
    tDeltaZ: any;
    tMaxX: any;
    tMaxY: any;
    tMaxZ: any;
    block: any;
    maxDistance: any;

    constructor(pos: any, dir: any, maxDistance: any) {
        this.block = {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y),
            z: Math.floor(pos.z),
            face: BlockFace.UNKNOWN,
        };

        this.pos = pos;
        this.dir = dir;

        this.invDirX = dir.x === 0 ? Number.MAX_VALUE : 1 / dir.x;
        this.invDirY = dir.y === 0 ? Number.MAX_VALUE : 1 / dir.y;
        this.invDirZ = dir.z === 0 ? Number.MAX_VALUE : 1 / dir.z;

        this.stepX = Math.sign(dir.x);
        this.stepY = Math.sign(dir.y);
        this.stepZ = Math.sign(dir.z);

        this.tDeltaX = dir.x === 0 ? Number.MAX_VALUE : Math.abs(1 / dir.x);
        this.tDeltaY = dir.y === 0 ? Number.MAX_VALUE : Math.abs(1 / dir.y);
        this.tDeltaZ = dir.z === 0 ? Number.MAX_VALUE : Math.abs(1 / dir.z);

        this.tMaxX =
            dir.x === 0
                ? Number.MAX_VALUE
                : Math.abs((this.block.x + (dir.x > 0 ? 1 : 0) - pos.x) / dir.x);
        this.tMaxY =
            dir.y === 0
                ? Number.MAX_VALUE
                : Math.abs((this.block.y + (dir.y > 0 ? 1 : 0) - pos.y) / dir.y);
        this.tMaxZ =
            dir.z === 0
                ? Number.MAX_VALUE
                : Math.abs((this.block.z + (dir.z > 0 ? 1 : 0) - pos.z) / dir.z);

        this.maxDistance = maxDistance;
    }

    // Returns null if none of the shapes is intersected, otherwise returns intersect pos and face
    // shapes are translated by offset
    intersect(shapes: any, offset: any) {
        // Shapes is an array of shapes, each in the form of: [x0, y0, z0, x1, y1, z1]
        let t = Number.MAX_VALUE;
        let f = BlockFace.UNKNOWN;
        const p = this.pos.minus(offset);
        for (const shape of shapes) {
            let tmin = (shape[this.invDirX > 0 ? 0 : 3] - p.x) * this.invDirX;
            let tmax = (shape[this.invDirX > 0 ? 3 : 0] - p.x) * this.invDirX;
            const tymin = (shape[this.invDirY > 0 ? 1 : 4] - p.y) * this.invDirY;
            const tymax = (shape[this.invDirY > 0 ? 4 : 1] - p.y) * this.invDirY;

            let face = this.stepX > 0 ? BlockFace.WEST : BlockFace.EAST;

            if (tmin > tymax || tymin > tmax) continue;
            if (tymin > tmin) {
                tmin = tymin;
                face = this.stepY > 0 ? BlockFace.BOTTOM : BlockFace.TOP;
            }
            if (tymax < tmax) tmax = tymax;

            const tzmin = (shape[this.invDirZ > 0 ? 2 : 5] - p.z) * this.invDirZ;
            const tzmax = (shape[this.invDirZ > 0 ? 5 : 2] - p.z) * this.invDirZ;

            if (tmin > tzmax || tzmin > tmax) continue;
            if (tzmin > tmin) {
                tmin = tzmin;
                face = this.stepZ > 0 ? BlockFace.NORTH : BlockFace.SOUTH;
            }
            if (tzmax < tmax) tmax = tzmax;

            if (tmin < t) {
                t = tmin;
                f = face;
            }
        }
        if (t === Number.MAX_VALUE) return null;
        return { pos: this.pos.plus(this.dir.scaled(t)), face: f };
    }

    next() {
        if (
            Math.min(Math.min(this.tMaxX, this.tMaxY), this.tMaxZ) > this.maxDistance
        ) {
            return null;
        }

        if (this.tMaxX < this.tMaxY) {
            if (this.tMaxX < this.tMaxZ) {
                this.block.x += this.stepX;
                this.tMaxX += this.tDeltaX;
                this.block.face = this.stepX > 0 ? BlockFace.WEST : BlockFace.EAST;
            } else {
                this.block.z += this.stepZ;
                this.tMaxZ += this.tDeltaZ;
                this.block.face = this.stepZ > 0 ? BlockFace.NORTH : BlockFace.SOUTH;
            }
        } else {
            if (this.tMaxY < this.tMaxZ) {
                this.block.y += this.stepY;
                this.tMaxY += this.tDeltaY;
                this.block.face = this.stepY > 0 ? BlockFace.BOTTOM : BlockFace.TOP;
            } else {
                this.block.z += this.stepZ;
                this.tMaxZ += this.tDeltaZ;
                this.block.face = this.stepZ > 0 ? BlockFace.NORTH : BlockFace.SOUTH;
            }
        }

        return this.block;
    }
}
