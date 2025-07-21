# File: docker-compose.yml (in project root)

version: '3.8'

services:
  # Main API service
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
      - LOG_LEVEL=debug
      - API_VERSION=v1
    volumes:
      # Mount source code for development hot reload
      - ./src:/app/src:ro
      - ./package.json:/app/package.json:ro
      - ./tsconfig.json:/app/tsconfig.json:ro
    # Override the command for development
    command: npm run dev
    
  # We'll add these in later steps:
  # postgres:
  #   image: postgres:15-alpine
  #   environment:
  #     - POSTGRES_USER=payment_user
  #     - POSTGRES_PASSWORD=payment_pass
  #     - POSTGRES_DB=payment_db
  #   ports:
  #     - "5432:5432"
    
  # redis:
  #   image: redis:7-alpine
  #   ports:
  #     - "6379:6379"