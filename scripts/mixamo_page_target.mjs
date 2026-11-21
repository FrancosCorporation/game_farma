/** Resolve exactly one task-owned Mixamo tab; never guess when tabs are ambiguous. */
export async function resolveMixamoTaskPage(pages, taskTabId = process.env.MIXAMO_TASK_TAB_ID) {
  const mixamoPages = pages.filter((page) => {
    try { return new URL(page.url()).hostname === 'www.mixamo.com'; }
    catch { return false; }
  });

  if (taskTabId) {
    const matches = [];
    for (const page of mixamoPages) {
      const currentId = await page.evaluate(() => window.__farmaMixamoTaskTabId || null);
      if (currentId === taskTabId) matches.push(page);
    }
    if (matches.length !== 1) {
      throw new Error(`Expected one Mixamo tab tagged "${taskTabId}", found ${matches.length}.`);
    }
    return matches[0];
  }

  if (mixamoPages.length > 1) {
    throw new Error(`Found ${mixamoPages.length} Mixamo tabs; tag the task tab and set MIXAMO_TASK_TAB_ID.`);
  }
  return mixamoPages[0] || null;
}

