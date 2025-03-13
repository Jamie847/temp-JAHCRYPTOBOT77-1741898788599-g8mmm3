FROM node:20-slim

WORKDIR /app

# Install curl and build essentials for native modules
RUN apt-get update && apt-get install -y curl build-essential python3 && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Build server
RUN npm run build

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose port
EXPOSE ${PORT}

# Start command
CMD ["npm", "start"]
