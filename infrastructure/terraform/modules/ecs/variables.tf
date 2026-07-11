variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs"
  type        = list(string)
  default     = []
}

variable "image_uri" {
  description = "Docker image URI"
  type        = string
}

variable "replica_count" {
  description = "Number of replicas"
  type        = number
  default     = 3
}
