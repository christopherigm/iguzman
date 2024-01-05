type ItemResponse = {
  id: string;
  message: string;
  name?: string;
  status: 'downloading' | 'none' | 'ready' | 'error';
  url: string;
  error?: any;
};

export default ItemResponse;
