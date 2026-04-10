use dashmap::DashMap;
use dashmap::mapref::entry::Entry;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(300); // 5 minutes

pub struct SeenSet(DashMap<String, Instant>);

impl SeenSet {
    pub fn new() -> Self {
        Self(DashMap::new())
    }

    /// Returns true if this signature was seen within TTL.
    /// Uses DashMap's entry() API for atomic check-and-insert within a shard lock,
    /// preventing a TOCTOU race where two concurrent requests with the same signature
    /// both observe "not present" and both proceed as non-duplicates.
    ///
    /// Does not refresh TTL on duplicate — tracks first-seen time.
    ///
    /// Note: the dedup key is the HMAC signature (a function of the raw body),
    /// not a logical event ID. Two distinct events with identical bodies would
    /// be deduplicated as the same delivery. This is acceptable because the
    /// webhook envelope includes a timestamp, making body collisions across
    /// distinct events extremely unlikely in practice.
    pub fn check_and_insert(&self, sig: &str) -> bool {
        let now = Instant::now();
        match self.0.entry(sig.to_string()) {
            Entry::Occupied(mut e) => {
                if now.duration_since(*e.get()) < TTL {
                    true // duplicate within TTL
                } else {
                    // expired entry — overwrite with fresh timestamp, treat as new
                    e.insert(now);
                    false
                }
            }
            Entry::Vacant(e) => {
                e.insert(now);
                false
            }
        }
    }

    /// Removes all entries whose TTL has expired.
    /// Called periodically by a background task to bound memory usage.
    pub fn sweep(&self) {
        let now = Instant::now();
        self.0.retain(|_, inserted_at| now.duration_since(*inserted_at) < TTL);
    }
}

impl Default for SeenSet {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_signature_not_duplicate() {
        let set = SeenSet::new();
        assert!(!set.check_and_insert("sig-abc"));
    }

    #[test]
    fn same_signature_is_duplicate() {
        let set = SeenSet::new();
        set.check_and_insert("sig-abc");
        assert!(set.check_and_insert("sig-abc"));
    }

    #[test]
    fn different_signatures_not_duplicate() {
        let set = SeenSet::new();
        set.check_and_insert("sig-abc");
        assert!(!set.check_and_insert("sig-xyz"));
    }
}
