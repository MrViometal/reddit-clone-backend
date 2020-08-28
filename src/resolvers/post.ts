import { Resolver, Query, Ctx, Int, Arg } from 'type-graphql';
import { Post } from '../entities/Post';
import { MyContext } from 'src/types';

//graphql resolver
@Resolver()

//class definition
export class PostResolver {
  //query returns all posts
  @Query(() => [Post])

  //posts context type, and returns a promise with an array of posts
  posts(@Ctx() { em }: MyContext): Promise<Post[]> {
    //find posts with the arguments empty object
    return em.find(Post, {});
  }

  //query returns a post, and can return null
  @Query(() => Post, { nullable: true })

  //post arguments: id of type int, and context type, and return a promise with a post or null
  post(
    @Arg('id', () => Int) id: number,
    @Ctx() { em }: MyContext,
  ): Promise<Post | null> {
    //find one post with this id
    return em.findOne(Post, { id });
  }
}
