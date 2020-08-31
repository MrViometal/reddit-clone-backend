import {
  Resolver,
  Mutation,
  Field,
  Arg,
  Ctx,
  ObjectType,
  Query,
  Args,
} from 'type-graphql';
import { MyContext } from 'src/types';
import { User } from '../entities/User';
import argon2 from 'argon2';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  COOKIE_NAME,
  FORGET_PASSWORD_PREFIX,
  FORGET_PASSWORD_EXPIRY,
} from '../constants';
import { validateRegister } from '../utils/validateRegister';
import { UsernamePasswordInput } from './UsernamePasswordInput';
import { sendEmail } from '../utils/sendEmail';
import { v4 } from 'uuid';

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class UserResolver {
  //me User
  @Query(() => User, { nullable: true })
  async me(@Ctx() { req, em }: MyContext) {
    const id = req.session.userId;
    //not logged in
    if (!id) {
      return null;
    }
    const user = await em.findOne(User, { id });
    return user;
  }

  //get users
  @Query(() => [User])
  getUsers(@Ctx() { em }: MyContext): Promise<User[]> {
    //not logged in

    return em.find(User, {});
  }

  //register a user
  @Mutation(() => UserResponse)
  async register(
    // @Arg('options') options: string,
    @Arg('options') options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext,
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) return { errors };
    const hashedPassword = await argon2.hash(options.password);
    let user;
    try {
      const result = await (em as EntityManager)
        .createQueryBuilder(User)
        .getKnexQuery()
        .insert({
          username: options.username,
          email: options.email,
          password: hashedPassword,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');
      user = result[0];
    } catch (err) {
      if (err.code === '23505') {
        //duplicate username error
        return {
          errors: [
            {
              field: `username`,
              message: `username already exists`,
            },
          ],
        };
      }
    }

    req.session.userId = user.id;
    return {
      user: {
        ...user,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    };
  }

  //login a user
  @Mutation(() => UserResponse)
  async login(
    @Arg('usernameOrEmail') usernameOrEmail: string,
    @Arg('password') password: string,
    @Ctx() { em, req }: MyContext,
  ): Promise<UserResponse> {
    const user = await em.findOne(
      User,
      usernameOrEmail.includes('@')
        ? { email: usernameOrEmail }
        : { username: usernameOrEmail },
    );
    if (!user) {
      return {
        errors: [
          {
            field: `usernameOrEmail`,
            message: `this username or email doesn't exist`,
          },
        ],
      };
    }
    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return {
        errors: [
          {
            field: `password`,
            message: `this password is not correct`,
          },
        ],
      };
    }

    req.session.userId = user.id;

    return { user };
  }

  //logout a user
  @Mutation(() => Boolean)
  logout(@Ctx() { req, res }: MyContext) {
    return new Promise(resolve => {
      req.session.destroy(err => {
        if (err) {
          console.log(err);
          resolve(false);
          return;
        }
        res.clearCookie(COOKIE_NAME);
        resolve(true);
      });
    });
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg('email') email: string,
    @Ctx() { em, redis }: MyContext,
  ) {
    const user = await em.findOne(User, { email });

    if (!user) {
      return true;
    }
    const token = v4();

    await redis.set(
      FORGET_PASSWORD_PREFIX + token,
      user.id,
      'ex',
      FORGET_PASSWORD_EXPIRY,
    );

    const emailTemplate = `<a href='http://localhost:3000/change-password/${token}'>reset password</a>`;

    await sendEmail(email, emailTemplate);
    return true;
  }

  @Mutation(() => UserResponse)
  async changePassword(
    @Arg('token') token: string,
    @Arg('newPassword') newPassword: string,
    @Ctx() { redis, em, req }: MyContext,
  ): Promise<UserResponse> {
    if (newPassword.length <= 3) {
      return {
        errors: [
          {
            field: `newPassword`,
            message: `new password length must be greater than 3`,
          },
        ],
      };
    }
    const redisKey = FORGET_PASSWORD_PREFIX + token;
    const userId = await redis.get(redisKey);

    if (!userId) {
      return {
        errors: [
          {
            field: `token`,
            message: `token expired`,
          },
        ],
      };
    }
    const user = await em.findOne(User, { id: parseInt(userId) });
    if (!user) {
      return {
        errors: [
          {
            field: `token`,
            message: `user no longer exists`,
          },
        ],
      };
    }

    user.password = await argon2.hash(newPassword);
    await em.persistAndFlush(user);
    await redis.del(redisKey);

    req.session.userId = user.id;

    return { user };
  }
}
