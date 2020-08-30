import {
  Resolver,
  Mutation,
  InputType,
  Field,
  Arg,
  Ctx,
  ObjectType,
  Query,
} from 'type-graphql';
import { MyContext } from 'src/types';
import { User } from '../entities/User';
import argon2 from 'argon2';
import { EntityManager } from '@mikro-orm/postgresql';

@InputType()
class UsernamePasswordInput {
  @Field()
  username: string;

  @Field()
  password: string;
}

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
    @Arg('options') options: UsernamePasswordInput,
    @Ctx() { em }: MyContext,
  ): Promise<UserResponse> {
    if (options.username.length <= 2) {
      return {
        errors: [
          {
            field: `username`,
            message: `username length must be greater than 2`,
          },
        ],
      };
    }
    if (options.password.length <= 3) {
      return {
        errors: [
          {
            field: `password`,
            message: `password length must be greater than 3`,
          },
        ],
      };
    }
    const hashedPassword = await argon2.hash(options.password);
    let user;
    try {
      const result = await (em as EntityManager)
        .createQueryBuilder(User)
        .getKnexQuery()
        .insert({
          username: options.username,
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
    // return { user:{
    //   ...user,
    //   createdAt=user.created_at,

    // } };
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
    @Arg('options') options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext,
  ): Promise<UserResponse> {
    const user = await em.findOne(User, { username: options.username });
    if (!user) {
      return {
        errors: [
          {
            field: `username`,
            message: `this username doesn't exist`,
          },
        ],
      };
    }
    const valid = await argon2.verify(user.password, options.password);
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
}
