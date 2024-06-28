import { ObjectId } from 'mongodb';

type Item = {
  _id?: ObjectId;
  id?: string;
  name?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  filename?: string;
  extention?: 'm4a' | 'mp4' | 'mov';
  justAudio?: boolean;
  hdTikTok?: boolean;
  status?:
    | 'none'
    | 'downloading'
    | 'ready'
    | 'error'
    | 'deleted'
    | 'canceled'
    | 'processing-h264';
  url?: string;
  error?: string;
  created?: Date;
  remoteAddress?: string;
};

export default Item;
