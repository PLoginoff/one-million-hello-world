variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "one-million-hello-world"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "image_uri" {
  description = "Docker image URI for the application"
  type        = string
}

variable "replica_count" {
  description = "Number of application replicas"
  type        = number
  default     = 3
}
