const GetEnvVariables = () => {
  const URLBase = String(process.env.URL_BASE) || 'http://127.0.0.1:3000';
  const defaultLanguage = String(process.env.DEFAULT_LANGUAGE) || 'en';
  const loginEnabled = process.env.LOGIN_ENABLED === 'true' ? true : false;
  const cartEnabled = process.env.CART_ENABLED === 'true' ? true : false;
  const favoritesEnabled = process.env.FAVORITES_ENABLED === 'true' ? true : false;
  const ordersEnabled = process.env.ORDERS_ENABLED === 'true' ? true : false;
  return {
    URLBase,
    defaultLanguage,
    loginEnabled,
    cartEnabled,
    favoritesEnabled,
    ordersEnabled
  };
};

export default GetEnvVariables;
