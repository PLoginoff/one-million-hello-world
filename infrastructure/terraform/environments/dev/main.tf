/**
 * Dev environment Terraform configuration
 */

terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "one-million-hello-world-tfstate-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "one-million-hello-world-tflock-dev"
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc-dev"
  cidr = "10.1.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  private_subnets = ["10.1.1.0/24", "10.1.2.0/24"]
  public_subnets  = ["10.1.101.0/24", "10.1.102.0/24"]

  enable_nat_gateway = false
  enable_vpn_gateway = false
}

module "ecs" {
  source       = "../../modules/ecs"
  project_name = "${var.project_name}-dev"
  environment  = "dev"
  image_uri    = var.image_uri
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnets
  desired_count = 1
}
