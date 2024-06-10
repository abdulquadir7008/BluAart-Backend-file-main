# # Stage 1: Build Stage using Node.js 16
# FROM node:16 AS build-env
# COPY . /app
# WORKDIR /app

# # Download and install IPFS
# RUN wget https://dist.ipfs.tech/kubo/v0.23.0/kubo_v0.23.0_linux-amd64.tar.gz && \
#     tar -xvzf kubo_v0.23.0_linux-amd64.tar.gz && \
#     cd kubo && \
#     bash install.sh && \
#     ipfs init

# # Install npm dependencies excluding dev dependencies
# RUN npm ci --omit=dev

# # Stage 2: Final Stage using Node.js 16
# FROM node:16

# # Copy files from the build-env stage
# COPY --from=build-env /app /app
# WORKDIR /app

# # Expose port 6098
# EXPOSE 6098

# # Command to run the application
# CMD ["src/Serverlogs.js"]


FROM node:16

WORKDIR /app

# Download and install IPFS
RUN wget https://dist.ipfs.tech/kubo/v0.23.0/kubo_v0.23.0_linux-amd64.tar.gz && \
    tar -xvzf kubo_v0.23.0_linux-amd64.tar.gz && \
    cd kubo && \
    bash install.sh && \
    ipfs init

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 6098

CMD ["node", "src/Serverlogs.js"]

