import { Post } from './entities/Post';
import { __prod__ } from './constants';
import { MikroORM } from '@mikro-orm/core';

const defaultConfig: Parameters<typeof MikroORM.init>[0] = {
  entities: [Post],
  dbName: 'lireddit',
  type: 'postgresql',
  debug: !__prod__,
};

export default defaultConfig;
