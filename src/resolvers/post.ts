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
    @Ctx() { req }: MyContext,
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;
    // return Post.find();

    const replacements: any[] = [realLimitPlusOne];

    if (req.session.userId) replacements.push(req.session.userId);

    let cursorIdx = 3;
    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
      cursorIdx = replacements.length;
    }

    const posts = await getConnection().query(
      `
      select p.*, 
      json_build_object(
        'id', u.id,
        'username', u.username,
        'email', u.email,
        'createdAt', u."createdAt",
        'createdAt', u."createdAt"
        ) creator,

     ${
       req.session.userId
         ? `(select value from vote where "userId" = $2 and "postId" = p.id) "voteStatus"`
         : `null as "voteStatus"`
     }
     
      from post p
      inner join public.user u on u.id = p."creatorId"
      ${cursor ? `where p."createdAt"< ${cursorIdx}` : ''}
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
    return Post.findOne(id, { relations: ['creator'] });
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
  async updatePost(
    @Arg('id') id: number,
    @Arg('title', () => String, { nullable: true }) title: string,
  ): Promise<Post | null> {
    const post = await Post.findOne(id);
    if (!post) return null;
    if (typeof title !== 'undefined') await Post.update({ id }, { title });
    return post;
  }

  //DELETE one, query returns boolean
  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg('id', () => Int) id: number,
    @Ctx() { req }: MyContext,
  ): Promise<boolean> {
    Post.delete({ id, creatorId: req.session.userId });
    return true;
  }

  //Text snippet
  @FieldResolver(() => String)
  textSnippet(@Root() root: Post) {
    return root.text.slice(0, 50);
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
