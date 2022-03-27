import pMemoize from 'p-memoize'
import { getAllPagesInSpace, getPageProperty, getBlockTitle } from 'notion-utils'

import * as types from './types'
import { includeNotionIdInUrls, overrideCreatedTime, overrideLastEditedTime } from './config'
import { notion } from './notion'
import { getCanonicalPageId } from './get-canonical-page-id'
import { getPagePropertyExtend } from './get-page-property'
import { PageBlock } from 'notion-types'

const uuid = !!includeNotionIdInUrls

export const getAllPages = pMemoize(getAllPagesImpl, { maxAge: 60000 * 5 })
// For testing use.
// export const getAllPages = pMemoize(getAllPagesImpl, { maxAge: 1000 })

export async function getAllPagesImpl(
  rootNotionPageId: string,
  rootNotionSpaceId: string
): Promise<Partial<types.SiteMap>> {
  const pageMap = await getAllPagesInSpace(
    rootNotionPageId,
    rootNotionSpaceId,
    notion.getPage.bind(notion)
  )

  const canonicalPageMap = Object.keys(pageMap).reduce(
    (map, pageId: string) => {
      const recordMap = pageMap[pageId]
      if (!recordMap) {
        throw new Error(`Error loading page "${pageId}"`)
      }

      let canonicalPageId = getCanonicalPageId(pageId, recordMap, {
        uuid
      })

      const block = recordMap.block[pageId]?.value as PageBlock

      // if the page contains a property `Draft` with value `true`,
      // then it is a draft page and should not be included in the sitemap.
      if (block) {
        let draft = getPagePropertyExtend('Draft', block, recordMap)

        console.log(draft)

        if (draft === 'Yes') {
          console.log(`${pageId} is a draft page and will not be included in the sitemap.`)
          return map;
        }
      } 

      // console.group(`Page "${pageId}"`)
      // console.log(block)
      // console.groupEnd()

      // Get Page Title
      const title = getBlockTitle(block, recordMap)

      // Get Last Edited Time
      let lastEditedTime: Date | null = null;
      if (overrideLastEditedTime) {
        let timestamp = "";
        try {
          timestamp = getPagePropertyExtend(overrideLastEditedTime, block, recordMap);
        } catch (e) {
          console.error(e);
        }
        lastEditedTime = new Date(timestamp);
        // If it's invalidDate, set to null
        if (isNaN(lastEditedTime.getTime())) {
          console.log('overrideLastEditedTime:', overrideLastEditedTime, '. Invalid lastEditedTime: ', lastEditedTime);
          lastEditedTime = null;
        }
      }
      if (!lastEditedTime)
        lastEditedTime = block?.last_edited_time ? new Date(block.last_edited_time) : null

      // Get Created Time
      let createdTime: Date | null = null;
      if (overrideCreatedTime) {
        let timestamp = "";
        try {
          timestamp = getPagePropertyExtend(overrideCreatedTime, block, recordMap);
        } catch (e) {
          console.error(e);
        }
        createdTime = new Date(timestamp);
        // If it's invalidDate, set to null
        if (isNaN(createdTime.getTime())) {
          console.log('OverrideCreatedTime:', overrideCreatedTime, '. Invalid createdTime: ', createdTime);
          createdTime = null;
        }
      }
      if (!createdTime)
        createdTime = block?.created_time ? new Date(block.created_time) : null

      // Get Page cover in `format.page_cover`
      const pageCover = (block as PageBlock).format?.page_cover || null

      // Insert SlugName instead of PageId.
      if (block) {
        let slugName = getPageProperty('SlugName', block, recordMap)

        if (slugName) {
          canonicalPageId = slugName
        }
      }

      const canonicalPageData: types.CanonicalPageData = {
        pageID: pageId,
        lastEditedTime,
        createdTime,
        title,
        cover: pageCover,
      }

      console.log(canonicalPageData)

      console.groupEnd()

      if (map[canonicalPageId]) {
        console.error(
          'error duplicate canonical page id',
          canonicalPageId,
          pageId,
          map[canonicalPageId]
        )

        return map
      } else {
        return {
          ...map,
          [canonicalPageId]: canonicalPageData
        }
      }
    },
    {}
  )

  return {
    pageMap,
    canonicalPageMap
  }
}
