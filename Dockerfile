FROM node:18

# Install dependencies required by Puppeteer
RUN apt-get update && apt-get install -y \
  wget \
  curl \
  xvfb \
  libx11-xcb1 \
  libnss3 \
  libatk1.0-0 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libdbus-1-3 \
  libappindicator3-1 \
  fonts-liberation \
  chromium

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Set environment variable to use ARM64 Chromium for Apple Silicon
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# Copy all project files
COPY . .

# Run the Puppeteer script
CMD ["node", "script.js"]
