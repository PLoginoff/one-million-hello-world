# Main Makefile for One Million Hello World project
# Provides unified commands for build, run, test and deploy

.PHONY: help install build start start-dev test test-watch test-coverage lint lint-fix format type-check clean deploy stats

# Show available make commands with descriptions
help:
	@echo "Available commands:"
	@echo "  make install       - Install dependencies"
	@echo "  make build         - Compile TypeScript"
	@echo "  make start         - Start production server"
	@echo "  make start-dev     - Start development server with ts-node"
	@echo "  make test          - Run unit tests"
	@echo "  make test-watch    - Run tests in watch mode"
	@echo "  make test-coverage - Run tests with coverage report"
	@echo "  make lint          - Run ESLint"
	@echo "  make lint-fix      - Fix ESLint issues automatically"
	@echo "  make format        - Format code with Prettier"
	@echo "  make type-check    - Run TypeScript type check without emit"
	@echo "  make clean         - Remove build artifacts (dist/)"
	@echo "  make deploy        - Build and start production server"
	@echo "  make stats         - Show project statistics"

# Install all npm dependencies (production + dev)
install:
	npm install

# Compile TypeScript sources into dist/
build:
	npx tsc

# Start the compiled production server
start:
	npm start

# Start development server with hot reload via ts-node
start-dev:
	npm run start:dev

# Run all unit tests once
test:
	npm test

# Run tests in watch mode (re-run on file changes)
test-watch:
	npm run test:watch

# Run tests and generate coverage report
test-coverage:
	npm run test:coverage

# Check code style with ESLint
lint:
	npm run lint

# Fix auto-fixable ESLint issues
lint-fix:
	npm run lint:fix

# Format all TypeScript files with Prettier
format:
	npm run format

# Run TypeScript type checker without emitting files
type-check:
	npm run type-check

# Remove compiled build artifacts (dist/ directory)
clean:
	rm -rf dist

# Full deployment: build project and start production server
deploy: build start

# Show project statistics (files, lines, commits, etc.)
stats:
	node scripts/project-stats.js
