/**
 * Production environment Terraform configuration
 */

terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "one-million-hello-world-tfstate-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "one-million-hello-world-tflock-prod"
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc-prod"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_vpn_gateway   = true
  enable_dns_hostnames = true
  enable_dns_support   = true
}

module "ecs" {
  source       = "../../modules/ecs"
  project_name = "${var.project_name}-prod"
  environment  = "prod"
  image_uri    = var.image_uri
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnets
  desired_count = 3
}

module "rds" {
  source              = "../../modules/rds"
  project_name        = "${var.project_name}-prod"
  environment         = "prod"
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnets
  allocated_storage   = 100
  instance_class      = "db.t3.medium"
  multi_az            = true
}
