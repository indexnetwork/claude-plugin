use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Returns true if the raw body matches the given signature header.
/// Header format: "sha256=<hex>". Returns false on any parse or mismatch.
pub fn verify_signature(secret: &str, body: &[u8], header: &str) -> bool {
    let hex_digest = match header.strip_prefix("sha256=") {
        Some(h) => h,
        None => return false,
    };
    let provided = match hex::decode(hex_digest) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(body);
    // verify_slice uses the `subtle` crate internally for constant-time comparison,
    // preventing timing-based signature oracle attacks.
    mac.verify_slice(&provided).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_signature_passes() {
        let body = b"hello";
        let secret = "mysecret";
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let expected_hex = hex::encode(mac.finalize().into_bytes());
        let header = format!("sha256={expected_hex}");
        assert!(verify_signature(secret, body, &header));
    }

    #[test]
    fn wrong_signature_fails() {
        assert!(!verify_signature("mysecret", b"hello", "sha256=deadbeef"));
    }

    #[test]
    fn missing_prefix_fails() {
        assert!(!verify_signature("mysecret", b"hello", "deadbeef"));
    }

    #[test]
    fn empty_header_fails() {
        assert!(!verify_signature("mysecret", b"hello", ""));
    }
}
