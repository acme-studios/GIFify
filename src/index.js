import { Container } from "@cloudflare/containers";

/**
 * This class defines the configuration for the container.
 * It's linked to the container definition in wrangler.toml by its name.
 */
export class GiffyContainer extends Container {
  // The port Express app is listening on inside the container.
  defaultPort = 8080;
  // Put the container to sleep after 5 minutes of inactivity to save costs.
  sleepAfter = "5m";
  // Autoscale the container to handle more requests. (Beta feature)
  autoScale = true;
}

export default {
  /**
   * The fetch handler is the entry point for all requests.
   * @param {Request} request - The incoming request.
   * @param {Env} env - The environment object, containing bindings.
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    // This Worker is a simple pass-through. It forwards every request
    // to the same container instance. The container's Express app
    // will handle routing to either the UI or the conversion endpoint.
    
    // We get a single, default instance of our container.
    const containerInstance = env.GIFFY.get(env.GIFFY.idFromName("singleton"));
    
    // Forward the original request to the container and return its response.
    return containerInstance.fetch(request);
  },
};
