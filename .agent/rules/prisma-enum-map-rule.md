---
trigger: always_on
---

---
name: prisma-enum-map-rule
description: This is a new rule
---

# Overview

When entering (creating or updating) enum data into database using prisma than follow this steps

1. import the enum from generated prisma
   ex: import { PersonalPostStatus } from '@/generated/prisma/client';

2. import utility helper
   ex: import { getEnumKeyAsType } from '@/lib/utils';

3. use it like this
   ex: await this.prisma.client.personalPost.update({
   where: { id: postId },
   data: {
   postStatus: getEnumKeyAsType(
   PersonalPostStatus,
   'deleted',
   ) as PersonalPostStatus,
   },
   });

4. If checking enum value of fetched data from db, do it like this

const post = await this.prisma.client.personalPost.findUnique({
where: { id: postId },
include: PERSONAL_POST_INCLUDE_WITH_COUNTS,
});

    if (
      !post ||
      post.postStatus === getEnumKeyAsType(PersonalPostStatus, 'deleted')
    ) {
      throw new NotFoundException('Post not found');
    }

5. If checking enum value from elsewhere (not fetched from db, example: checking enum sent in request data) than do it normally

newRole === CommunityMemberRole.OWNER
