variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "one-million-hello-world"
}

variable "image_uri" {
  description = "Docker image URI"
  type        = string
  default     = "one-million-hello-world:staging"
}
