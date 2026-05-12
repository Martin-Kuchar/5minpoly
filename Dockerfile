FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p logs

# Run the bot in production mode (not simulation)
CMD ["npm", "run", "prod"]
