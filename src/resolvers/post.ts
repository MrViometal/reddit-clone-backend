import { MyContext } from 'src/types';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { Post } from '../entities/Post';

//graphql resolver
@Resolver()

//class definition
export class PostResolver {
  @Query(() => [Post]) //GET all, query returns all posts
  //posts context type, and returns a promise with an array of posts
  posts(@Ctx() { em }: MyContext): Promise<Post[]> {
    return em.find(Post, {}); //find posts with the arguments empty object
  }

  @Query(() => Post, { nullable: true }) //GET one, query returns a post, and can return null
  //post arguments: id (number), and context type, and return a promise with a post or null
  post(@Arg('id') id: number, @Ctx() { em }: MyContext): Promise<Post | null> {
    return em.findOne(Post, { id }); //find one post with this id
  }

  @Mutation(() => Post) //POST one, query returns a post
  //post arguments: title (string), and context type, and return a promise with a post
  @UseMiddleware(isAuth)
  async createPost(
    @Arg('title') title: string,
    @Ctx() { em }: MyContext,
  ): Promise<Post> {
    const post = em.create(Post, { title }); //create post

    await em.persistAndFlush(post); //add post to database

    return post;
  }

  @Mutation(() => Post, { nullable: true }) //Update one, query returns a post or null
  //post arguments: ir (number) & title (string), and context type, and return a promise with a post or null
  async updatePost(
    @Arg('id') id: number,
    @Arg('title', () => String, { nullable: true }) title: string,
    @Ctx() { em }: MyContext,
  ): Promise<Post | null> {
    const post = await em.findOne(Post, { id }); //find post
    if (!post) {
      return null; //if there is no post return null
    }
    if (typeof title !== 'undefined') {
      //if there is a title
      post.title = title; //set new title
      await em.persistAndFlush(post); //add post to database
    }
    return post;
  }

  @Mutation(() => Boolean) //delete one, query returns boolean
  //post arguments: id (number), and context type, and return a promise with a post
  async deletePost(
    @Arg('id') id: number,
    @Ctx() { em }: MyContext,
  ): Promise<boolean> {
    await em.nativeDelete(Post, { id }); //delete post with id
    return true;
  }
}
