export {Header} from './src/components/Header/Header';
export {HomeScreen} from './src/screens/HomeScreen';
export {ApiDemo} from './src/components/ApiDemo';

export {
  scaleFontSize,
  scaleWidth,
  scaleHeight,
} from './src/utils/scaling';

// HTTP Client (fetch-based)
export {createHttpClient} from './src/services/httpClient';
export type {HttpClientConfig, HttpResponse} from './src/services/httpClient';



// MarbleTime app (shared by the Fire OS and Vega builds)
export {MarbleTimeApp} from './src/marble/MarbleTimeApp';
