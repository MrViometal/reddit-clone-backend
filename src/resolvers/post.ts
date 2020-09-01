import {
  Arg,
  Mutation,
  Query,
  Resolver,
  InputType,
  Field,
  Ctx,
  UseMiddleware,
} from 'type-graphql';
import { Post } from '../entities/Post';
import { MyContext } from '../types';
import { isAuth } from '../middleware/isAuth';

@InputType()
class PostInput {
  @Field()
  title: string;

  @Field()
  text: string;
}

//graphql resolver
@Resolver()

//class definition
export class PostResolver {
  @Query(() => [Post]) //GET all, query returns all posts
  //posts context type, and returns a promise with an array of posts
  posts(): Promise<Post[]> {
    return Post.find(); //find posts with the arguments empty object
  }

  @Query(() => Post, { nullable: true }) //GET one, query returns a post, and can return null
  //post arguments: id (number), and context type, and return a promise with a post or null
  post(@Arg('id') id: number): Promise<Post | undefined> {
    return Post.findOne(id); //find one post with this id
  }

  @Mutation(() => Post) //POST one, query returns a post
  //post arguments: title (string), and context type, and return a promise with a post
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

  @Mutation(() => Post, { nullable: true }) //Update one, query returns a post or null
  //post arguments: ir (number) & title (string), and context type, and return a promise with a post or null
  async updatePost(
    @Arg('id') id: number,
    @Arg('title', () => String, { nullable: true }) title: string,
  ): Promise<Post | null> {
    const post = await Post.findOne(id); //find post
    if (!post) {
      return null; //if there is no post return null
    }
    if (typeof title !== 'undefined') {
      //if there is a title
      await Post.update({ id }, { title });
    }
    return post;
  }

  @Mutation(() => Boolean) //delete one, query returns boolean
  //post arguments: id (number), and context type, and return a promise with a post
  async deletePost(@Arg('id') id: number): Promise<boolean> {
    Post.delete(id);
    return true;
  }
}
