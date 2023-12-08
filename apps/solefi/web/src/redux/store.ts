import {
  createStore,
  applyMiddleware
} from 'redux';
import {
  persistStore,
  persistReducer
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { createLogger } from 'redux-logger';
import reducer from 'src/redux/reducers';
import { composeWithDevTools} from 'redux-devtools-extension';

const middleware = [];
if ( process.env.NODE_ENV !== 'production' ) {
  middleware.push(createLogger());
}

const persistConfig = {
  key: 'root',
  storage,
  whitelist: [
    'system',
    'user',
    'infoGrid',
    'slides',
    'howItWorks',
    'mosaicData',
    'page'
  ]
};

const persistedReducer = persistReducer(persistConfig, reducer);

const store = createStore(
  persistedReducer,
  composeWithDevTools(
    applyMiddleware(...middleware)
  )
);

export const persistor = persistStore(store);

export default store;

// https://www.npmjs.com/package/redux-persist
