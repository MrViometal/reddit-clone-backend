import {
  Arg,
  Mutation,
  Query,
  Resolver,
  InputType,
  Field,
  Ctx,
  UseMiddleware,
  Int,
  FieldResolver,
  Root,
  ObjectType,
} from 'type-graphql';
import { Post } from '../entities/Post';
import { MyContext } from '../types';
import { isAuth } from '../middleware/isAuth';
import { getConnection } from 'typeorm';
import { Vote } from '../entities/Vote';
import { User } from '../entities/User';

@InputType()
class PostInput {
  @Field()
  title: string;

  @Field()
  text: string;
}

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];

  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  //GET all, query returns all posts
  @Query(() => PaginatedPosts)
  async posts(
    @Arg('limit', () => Int) limit: number,
    @Arg('cursor', () => String, { nullable: true }) cursor: string | null,
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;
    // return Post.find();

    const replacements: any[] = [realLimitPlusOne];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
    }

    const posts = await getConnection().query(
      `
      select p.*
      from post p
      ${cursor ? `where p."createdAt" < $2` : ''}
      order by p."createdAt" DESC
      limit $1
    `,
      replacements,
    );

    // const qb = getConnection()
    //   .getRepository(Post)
    //   .createQueryBuilder('p')
    //   .innerJoinAndSelect('p.creator', 'u', 'u.id=p."creatorId"')
    //   .orderBy('p."createdAt"', 'DESC')
    //   .take(realLimitPlusOne);

    // if (cursor) {
    //   qb.where('p."createdAt" < :cursor', {
    //     cursor: new Date(parseInt(cursor)),
    //   });
    // }

    // const posts = await qb.getMany();
    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  //GET one, query returns a post or null
  @Query(() => Post, { nullable: true })
  post(@Arg('id', () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  //POST(create) one, query returns a post
  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Ctx() { req }: MyContext,
    @Arg('input') input: PostInput,
  ): Promise<Post> {
    return Post.create({
      ...input,
      creatorId: req.session.userId,
    }).save();
  }

  //UPDATE one, query returns a post or null
  @Mutation(() => Post, { nullable: true })
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg('id', () => Int) id: number,
    @Arg('title') title: string,
    @Arg('text') text: string,
    @Ctx() { req }: MyContext,
  ): Promise<Post | null> {
    const result = await getConnection()
      .createQueryBuilder()
      .update(Post)
      .set({ title, text })
      .where('id = :id and "creatorId" = :creatorId', {
        id,
        creatorId: req.session.userId,
      })
      .returning('*')
      .execute();
    // const post = await Post.findOne(id);
    // if (!post) return null;
    // return Post.update(, );
    return result.raw[0];
  }

  //DELETE one, query returns boolean
  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg('id', () => Int) id: number,
    @Ctx() { req }: MyContext,
  ): Promise<boolean> {
    // none cascade way
    // const post = await Post.findOne(id);
    // if (!post) return false;
    // if (post.creatorId !== req.session.userId) {
    //   throw new Error('not authorized');
    // }

    // await Vote.delete({ postId: id });
    await Post.delete({ id, creatorId: req.session.userId });
    return true;
  }

  //Text snippet
  @FieldResolver(() => String)
  textSnippet(@Root() post: Post) {
    return post.text.slice(0, 50);
  }

  //creators fetched from dataloader
  @FieldResolver(() => User)
  creator(@Root() post: Post, @Ctx() { userLoader }: MyContext) {
    return userLoader.load(post.creatorId);
  }

  //creators fetched from dataloader
  @FieldResolver(() => Int, { nullable: true })
  async voteStatus(@Root() post: Post, @Ctx() { voteLoader, req }: MyContext) {
    if (!req.session.userId) {
      return null;
    }

    const vote = await voteLoader.load({
      postId: post.id,
      userId: req.session.userId,
    });
    return vote ? vote.value : null;
  }

  //Up or Down vote a post
  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg('postId', () => Int) postId: number,
    @Arg('value', () => Int) value: number,
    @Ctx() { req }: MyContext,
  ) {
    //need to handle case of vote 0
    const isUpVote = value > 0;
    const realValue = isUpVote ? 1 : -1;
    const { userId } = req.session;

    const vote = await Vote.findOne({ where: { postId, userId } });

    if (vote && vote.value !== realValue) {
      //was up vote but want to down vote or vice versa
      await getConnection().transaction(async tm => {
        // update the already posted vote
        await tm.query(
          `
          update vote 
          set value = $1
          where "postId" = $2 and "userId" = $3
        `,
          [realValue, postId, userId],
        );

        //change vote value on post by multiplying the real value to negate the previous vote effect
        await tm.query(
          `
          update post   
          set points = points + $1
          where id = $2
        `,
          [2 * realValue, postId],
        );
      });
    } else if (!vote) {
      //no vote yet
      await getConnection().transaction(async tm => {
        // insert a vote
        await tm.query(
          `
          insert into vote ("userId", "postId", value)
          values ($1,$2,$3)
        `,
          [userId, postId, realValue],
        );

        //change vote value on post
        await tm.query(
          `
          update post   
          set points = points + $1
          where id = $2
        `,
          [realValue, postId],
        );
      });
    } else {
      //user is being dumb on purpose
      //do nothing
    }

    return true;
  }
}
