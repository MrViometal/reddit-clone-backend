import { MikroORM } from '@mikro-orm/core';

const main = async () => {
  const orm = await MikroORM.init({
    dbNAme: 'lireddit',
    user: '',
    password: '',
    type: 'postgresql',
    debug: process.env.NODE_ENV !== 'production',
  });
};

console.log('hello world');
