const GetEnvVariables = () => {
  const hostName = process.env.HOSTNAME || 'localhost';
  const URLBase = process.env.URL_BASE || 'http://127.0.0.1:3000';
  const K8sURLBase = process.env.K8S_URL_BASE || 'http://127.0.0.1:3000';
  const defaultLanguage = process.env.DEFAULT_LANGUAGE || 'en';
  const loginEnabled = process.env.LOGIN_ENABLED === 'true' ? true : false;
  const cartEnabled = process.env.CART_ENABLED === 'true' ? true : false;
  const favoritesEnabled = process.env.FAVORITES_ENABLED === 'true' ? true : false;
  const ordersEnabled = process.env.ORDERS_ENABLED === 'true' ? true : false;
  const version = process.env.VERSION ?? '0.0.1';
  return {
    hostName,
    URLBase,
    K8sURLBase,
    defaultLanguage,
    loginEnabled,
    cartEnabled,
    favoritesEnabled,
    ordersEnabled,
    version,
  };
};

export default GetEnvVariables;
