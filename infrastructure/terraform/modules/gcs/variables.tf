variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "bucket_name" {
  description = "GCS bucket name for Terraform state"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "kms_key_id" {
  description = "KMS key ID for bucket encryption"
  type        = string
  default     = ""
}
