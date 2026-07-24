/**
 * Staging environment Terraform configuration
 */

terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "one-million-hello-world-tfstate-staging"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "one-million-hello-world-tflock-staging"
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc-staging"
  cidr = "10.2.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
  public_subnets  = ["10.2.101.0/24", "10.2.102.0/24", "10.2.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

module "ecs" {
  source       = "../../modules/ecs"
  project_name = "${var.project_name}-staging"
  environment  = "staging"
  image_uri    = var.image_uri
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnets
  desired_count = 2
}
