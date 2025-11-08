# Start with an official Node.js image. The 'slim' version is smaller and more secure.
FROM node:18-slim

# Update package lists, install ffmpeg, and then clean up to keep the image small.
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container. All subsequent commands run here.
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first.
# Leverages Docker's layer caching, speeding up future builds.
COPY package*.json ./

# Install the application's dependencies defined in package.json.
RUN npm install

# Copy the rest of the application's source code into the container.
# Includes server.js and the 'public' directory with the UI.
COPY . .

# Expose port 8080 to allow traffic to the Node.js server.
# The Cloudflare Worker will connect to this port.
EXPOSE 8080

# Define the command to start the application when the container launches.
CMD [ "node", "server.js" ]
