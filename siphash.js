class SipHash {
  constructor(key0, key1) {
    this.k0 = BigInt(key0);
    this.k1 = BigInt(key1);
  }

  // Simple SipHash-1-3 implementation for demo purposes
  hash(data, seed = 0) {
    let v0 = 0x736f6d6570736575n;
    let v1 = 0x646f72616e646f6dn;
    let v2 = 0x6c7967656e657261n;
    let v3 = 0x7465646279746573n;

    v3 ^= this.k1;
    v2 ^= this.k0;
    v1 ^= this.k1;
    v0 ^= this.k0;

    // Convert input to BigInt and add seed
    const m = BigInt(data) + BigInt(seed);

    // One compression round
    v3 ^= m;
    
    // SipRound x1
    v0 += v1;
    v1 = (v1 << 13n) | (v1 >> 51n);
    v1 ^= v0;
    v0 = (v0 << 32n) | (v0 >> 32n);
    
    // Three finalization rounds
    v0 ^= m;
    
    return Number(v0 & 0xFFFFFFFFn); // Return 32-bit hash
  }
}