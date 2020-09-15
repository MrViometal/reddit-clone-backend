import argon2 from 'argon2';
import { MyContext } from 'src/types';
import {
  Arg,
  Ctx,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  FieldResolver,
  Root,
} from 'type-graphql';
import { getConnection } from 'typeorm';
import { v4 } from 'uuid';
import {
  COOKIE_NAME,
  FORGET_PASSWORD_EXPIRY,
  FORGET_PASSWORD_PREFIX,
} from '../constants';
import { User } from '../entities/User';
import { sendEmail } from '../utils/sendEmail';
import { validateRegister } from '../utils/validateRegister';
import { UsernamePasswordInput } from './UsernamePasswordInput';

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

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => String)
  email(@Root() user: User, @Ctx() { req }: MyContext) {
    if (req.session.userId === user.id) {
      return user.email;
    }
    return '';
  }

  //me User
  @Query(() => User, { nullable: true })
  me(@Ctx() { req }: MyContext) {
    const id = req.session.userId;
    //not logged in
    if (!id) {
      return null;
    }
    return User.findOne(id);
  }

  //get users
  @Query(() => [User])
  getUsers(): Promise<User[]> {
    //not logged in

    return User.find();
  }

  //register a user
  @Mutation(() => UserResponse)
  async register(
    // @Arg('options') options: string,
    @Arg('options') options: UsernamePasswordInput,
    @Ctx() { req }: MyContext,
  ): Promise<UserResponse> {
    console.log({ options });
    const errors = validateRegister(options);
    if (errors) return { errors };
    const hashedPassword = await argon2.hash(options.password);
    let user;
    try {
      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({
          username: options.username,
          email: options.email,
          password: hashedPassword,
        })
        .returning('*')
        .execute();
      console.log({ result });
      user = result.raw[0];
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
    return { user };
    // return {
    //   user: {
    //     ...user,
    //     createdAt: user.created_at,
    //     updatedAt: user.updated_at,
    //   },
    // };
  }

  //login a user
  @Mutation(() => UserResponse)
  async login(
    @Arg('usernameOrEmail') usernameOrEmail: string,
    @Arg('password') password: string,
    @Ctx() { req }: MyContext,
  ): Promise<UserResponse> {
    const user = await User.findOne(
      usernameOrEmail.includes('@')
        ? { where: { email: usernameOrEmail } }
        : { where: { username: usernameOrEmail } },
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
    @Ctx() { redis }: MyContext,
  ) {
    const user = await User.findOne({ where: { email } });

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
    @Ctx() { redis, req }: MyContext,
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
    const userIdNum = parseInt(userId);
    const user = await User.findOne(userIdNum);
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

    await User.update(
      { id: userIdNum },
      { password: await argon2.hash(newPassword) },
    );
    await redis.del(redisKey);

    req.session.userId = user.id;

    return { user };
  }
}
