FROM node:24-slim

WORKDIR /app

# Update package repositories and install oath-toolkit and sqlite3
RUN apt-get update && \
    apt-get install -y oathtool sqlite3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN which oathtool && which sqlite3 || (echo "Required tools not installed correctly" && exit 1)

# Install dependencies first (for better caching)
COPY package.json ./
RUN npm install

# Copy application code
COPY . .

EXPOSE 3000

RUN chmod -R 777 /app/data

CMD ["npm", "start"]