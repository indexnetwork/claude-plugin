use dashmap::DashSet;
use std::sync::Arc;

pub struct SeenSet(Arc<DashSet<String>>);

impl SeenSet {
    pub fn new() -> Self {
        SeenSet(Arc::new(DashSet::new()))
    }
}

impl Clone for SeenSet {
    fn clone(&self) -> Self {
        SeenSet(Arc::clone(&self.0))
    }
}
