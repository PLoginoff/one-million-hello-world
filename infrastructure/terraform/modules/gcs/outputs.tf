output "bucket_name" {
  value = google_storage_bucket.tfstate.name
}

output "bucket_url" {
  value = google_storage_bucket.tfstate.url
}
