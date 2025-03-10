// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  Action,
  CloudResource,
  ContextV3,
  err,
  FileEffect,
  FxError,
  InputsWithProjectPath,
  IProgressHandler,
  MaybePromise,
  ok,
  Platform,
  ProvisionContextV3,
  QTreeNode,
  Result,
  SystemError,
  UserError,
  v3,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { cloneDeep } from "lodash";
import * as path from "path";
import "reflect-metadata";
import { Service } from "typedi";
import { getLocalizedString } from "../../../common/localizeUtils";
import { hasTab } from "../../../common/projectSettingsHelperV3";
import { globalVars } from "../../../core/globalVars";
import { getTemplatesFolder } from "../../../folder";
import {
  CommandAndResponseOptionItem,
  NotificationOptionItem,
} from "../../../plugins/solution/fx-solution/question";
import {
  BOTS_TPL_EXISTING_APP,
  COLOR_TEMPLATE,
  COMPOSE_EXTENSIONS_TPL_EXISTING_APP,
  CONFIGURABLE_TABS_TPL_EXISTING_APP,
  DEFAULT_COLOR_PNG_FILENAME,
  DEFAULT_OUTLINE_PNG_FILENAME,
  OUTLINE_TEMPLATE,
  STATIC_TABS_TPL_EXISTING_APP,
  DEFAULT_DEVELOPER,
  Constants,
} from "../../../plugins/resource/appstudio/constants";
import { AppStudioError } from "../../../plugins/resource/appstudio/errors";
import {
  autoPublishOption,
  manuallySubmitOption,
} from "../../../plugins/resource/appstudio/questions";
import { AppStudioResultFactory } from "../../../plugins/resource/appstudio/results";
import { TelemetryPropertyKey } from "../../../plugins/resource/appstudio/utils/telemetry";
import { ComponentNames } from "../../constants";
import { createTeamsApp, updateTeamsApp, publishTeamsApp, buildTeamsAppPackage } from "./appStudio";
import {
  BOTS_TPL_FOR_COMMAND_AND_RESPONSE_V3,
  BOTS_TPL_FOR_NOTIFICATION_V3,
  BOTS_TPL_V3,
  COMPOSE_EXTENSIONS_TPL_V3,
  CONFIGURABLE_TABS_TPL_V3,
  STATIC_TABS_TPL_V3,
  TEAMS_APP_MANIFEST_TEMPLATE,
  WEB_APPLICATION_INFO_V3,
} from "./constants";
import { readAppManifest, writeAppManifest } from "./utils";

@Service("app-manifest")
export class AppManifest implements CloudResource {
  name = "app-manifest";
  outputs = {
    teamsAppId: {
      key: "teamsAppId",
    },
    tenantId: {
      key: "tenantId",
    },
  };
  finalOutputKeys = ["teamsAppId", "tenantId"];
  init(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "app-manifest.init",
      type: "function",
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        return ok(["init app manifest template"]);
      },
      execute: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const existingApp = inputs.existingApp as boolean;
        const manifestString = TEAMS_APP_MANIFEST_TEMPLATE;
        const manifest = JSON.parse(manifestString);
        if (existingApp || !hasTab(context.projectSetting)) {
          manifest.developer = DEFAULT_DEVELOPER;
        }
        const templateFolder = path.join(inputs.projectPath, "templates");
        await fs.ensureDir(templateFolder);
        const appPackageFolder = path.join(templateFolder, "appPackage");
        await fs.ensureDir(appPackageFolder);
        const resourcesFolder = path.resolve(appPackageFolder, "resources");
        await fs.ensureDir(resourcesFolder);
        const targetManifestPath = path.join(appPackageFolder, "manifest.template.json");
        await fs.writeFile(targetManifestPath, JSON.stringify(manifest, null, 4));
        const templatesFolder = getTemplatesFolder();
        const defaultColorPath = path.join(templatesFolder, COLOR_TEMPLATE);
        const defaultOutlinePath = path.join(templatesFolder, OUTLINE_TEMPLATE);
        await fs.copy(defaultColorPath, path.join(resourcesFolder, DEFAULT_COLOR_PNG_FILENAME));
        await fs.copy(defaultOutlinePath, path.join(resourcesFolder, DEFAULT_OUTLINE_PNG_FILENAME));
        return ok(["init app manifest template"]);
      },
    };
    return ok(action);
  }
  addCapability(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "app-manifest.addCapability",
      type: "function",
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        return ok([
          `add capabilities (${JSON.stringify(inputs.capabilities)}) in manifest template`,
        ]);
      },
      execute: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const capabilities = inputs.capabilities as v3.ManifestCapability[];
        const res = await addCapabilities(inputs, capabilities);
        if (res.isErr()) return err(res.error);
        return ok([
          `add capabilities (${JSON.stringify(inputs.capabilities)}) in manifest template`,
        ]);
      },
    };
    return ok(action);
  }
  provision(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "app-manifest.provision",
      type: "function",
      enableProgressBar: true,
      progressTitle: getLocalizedString("plugins.appstudio.provisionTitle"),
      progressSteps: 1,
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        return ok([
          {
            type: "service",
            name: "teams.microsoft.com",
            remarks: "create Teams app if not exists",
          },
        ]);
      },
      execute: async (
        context: ContextV3,
        inputs: InputsWithProjectPath,
        progress?: IProgressHandler
      ) => {
        const ctx = context as ProvisionContextV3;
        await progress?.next(
          getLocalizedString("plugins.appstudio.provisionProgress", ctx.projectSetting.appName)
        );
        const res = await createTeamsApp(ctx, inputs, ctx.envInfo, ctx.tokenProvider);
        if (res.isErr()) return err(res.error);
        ctx.envInfo.state[ComponentNames.AppManifest].teamsAppId = res.value;
        globalVars.teamsAppId = res.value;
        return ok([
          {
            type: "service",
            name: "teams.microsoft.com",
            remarks: "create Teams app if not exists",
          },
        ]);
      },
    };
    return ok(action);
  }
  configure(
    context: ContextV3,
    inputs: InputsWithProjectPath,
    progress?: IProgressHandler
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "app-manifest.configure",
      type: "function",
      enableProgressBar: true,
      progressTitle: getLocalizedString("plugins.appstudio.provisionTitle"),
      progressSteps: 1,
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        return ok([
          {
            type: "service",
            name: "teams.microsoft.com",
            remarks: "update Teams app",
          },
        ]);
      },
      execute: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const ctx = context as ProvisionContextV3;
        await progress?.next(
          getLocalizedString("plugins.appstudio.postProvisionProgress", ctx.projectSetting.appName)
        );
        const res = await updateTeamsApp(ctx, inputs, ctx.envInfo, ctx.tokenProvider);
        if (res.isErr()) return err(res.error);
        return ok([
          {
            type: "service",
            name: "teams.microsoft.com",
            remarks: "update Teams app",
          },
        ]);
      },
    };
    return ok(action);
  }
  publish(
    context: ProvisionContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "app-manifest.publish",
      type: "function",
      enableTelemetry: true,
      telemetryComponentName: "AppStudioPlugin",
      telemetryEventName: "publish",
      question: (context: ContextV3, inputs: InputsWithProjectPath) => {
        if (inputs.platform === Platform.VSCode) {
          const buildOrPublish = new QTreeNode({
            name: Constants.BUILD_OR_PUBLISH_QUESTION,
            type: "singleSelect",
            staticOptions: [manuallySubmitOption, autoPublishOption],
            title: getLocalizedString("plugins.appstudio.publishTip"),
            default: autoPublishOption.id,
          });
          return ok(buildOrPublish);
        }
        return ok(undefined);
      },
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        return ok([
          {
            type: "service",
            name: "teams.microsoft.com",
            remarks: "publish teams app",
          },
        ]);
      },
      execute: async (
        context: ContextV3,
        inputs: InputsWithProjectPath,
        progress?: IProgressHandler,
        telemetryProps?: Record<string, string>
      ) => {
        const ctx = context as ProvisionContextV3;
        if (
          inputs.platform === Platform.VSCode &&
          inputs[Constants.BUILD_OR_PUBLISH_QUESTION] === manuallySubmitOption.id
        ) {
          if (telemetryProps) telemetryProps[TelemetryPropertyKey.manual] = String(true);
          try {
            const appPackagePath = await buildTeamsAppPackage(
              inputs.projectPath,
              ctx.envInfo,
              false,
              telemetryProps
            );
            const msg = getLocalizedString(
              "plugins.appstudio.adminApprovalTip",
              ctx.projectSetting.appName,
              appPackagePath
            );
            ctx.userInteraction
              .showMessage("info", msg, false, "OK", Constants.READ_MORE)
              .then((value) => {
                if (value.isOk() && value.value === Constants.READ_MORE) {
                  ctx.userInteraction.openUrl(Constants.PUBLISH_GUIDE);
                }
              });
            return ok(["build teams app package"]);
          } catch (error: any) {
            return err(
              AppStudioResultFactory.UserError(
                AppStudioError.TeamsPackageBuildError.name,
                AppStudioError.TeamsPackageBuildError.message(error),
                error.helpLink
              )
            );
          }
        }
        try {
          const res = await publishTeamsApp(
            ctx,
            inputs,
            ctx.envInfo,
            ctx.tokenProvider.m365TokenProvider
          );
          if (res.isErr()) return err(res.error);
          ctx.logProvider.info(`Publish success!`);
          if (inputs.platform === Platform.CLI) {
            const msg = getLocalizedString(
              "plugins.appstudio.publishSucceedNotice.cli",
              res.value.appName,
              Constants.TEAMS_ADMIN_PORTAL,
              Constants.TEAMS_MANAGE_APP_DOC
            );
            ctx.userInteraction.showMessage("info", msg, false);
          } else {
            const msg = getLocalizedString(
              "plugins.appstudio.publishSucceedNotice",
              res.value.appName,
              Constants.TEAMS_MANAGE_APP_DOC
            );
            const adminPortal = getLocalizedString("plugins.appstudio.adminPortal");
            ctx.userInteraction.showMessage("info", msg, false, adminPortal).then((value) => {
              if (value.isOk() && value.value === adminPortal) {
                ctx.userInteraction.openUrl(Constants.TEAMS_ADMIN_PORTAL);
              }
            });
          }
          if (telemetryProps) {
            telemetryProps[TelemetryPropertyKey.updateExistingApp] = String(res.value.update);
            telemetryProps[TelemetryPropertyKey.publishedAppId] = String(res.value.publishedAppId);
          }
        } catch (error: any) {
          if (error instanceof SystemError || error instanceof UserError) {
            throw error;
          } else {
            const publishFailed = new SystemError({
              name: AppStudioError.TeamsAppPublishFailedError.name,
              message: error.message,
              source: Constants.PLUGIN_NAME,
              error: error,
            });
            return err(publishFailed);
          }
        }
        return ok([
          {
            type: "service",
            name: "teams.microsoft.com",
            remarks: "publish teams app",
          },
        ]);
      },
    };
    return ok(action);
  }
}

export async function addCapabilities(
  inputs: InputsWithProjectPath,
  capabilities: v3.ManifestCapability[]
): Promise<Result<undefined, FxError>> {
  const appManifestRes = await readAppManifest(inputs.projectPath);
  if (appManifestRes.isErr()) return err(appManifestRes.error);
  const appManifest = appManifestRes.value;
  for (const capability of capabilities) {
    let staticTabIndex = appManifest.staticTabs?.length ?? 0;
    switch (capability.name) {
      case "staticTab":
        appManifest.staticTabs = appManifest.staticTabs || [];
        if (capability.snippet) {
          appManifest.staticTabs.push(capability.snippet);
        } else {
          if (capability.existingApp) {
            const template = cloneDeep(STATIC_TABS_TPL_EXISTING_APP[0]);
            template.entityId = "index" + staticTabIndex;
            appManifest.staticTabs.push(template);
          } else {
            const template = cloneDeep(STATIC_TABS_TPL_V3[0]);
            template.entityId = "index" + staticTabIndex;
            appManifest.staticTabs.push(template);
          }
          staticTabIndex++;
        }
        break;
      case "configurableTab":
        appManifest.configurableTabs = appManifest.configurableTabs || [];
        if (capability.snippet) {
          appManifest.configurableTabs.push(capability.snippet);
        } else {
          if (capability.existingApp) {
            appManifest.configurableTabs = appManifest.configurableTabs.concat(
              CONFIGURABLE_TABS_TPL_EXISTING_APP
            );
          } else {
            appManifest.configurableTabs =
              appManifest.configurableTabs.concat(CONFIGURABLE_TABS_TPL_V3);
          }
        }
        break;
      case "Bot":
        appManifest.bots = appManifest.bots || [];
        if (capability.snippet) {
          appManifest.bots.push(capability.snippet);
        } else {
          if (capability.existingApp) {
            appManifest.bots = appManifest.bots.concat(BOTS_TPL_EXISTING_APP);
          } else {
            if (appManifest.bots === undefined) {
              appManifest.bots = [];
            }

            const feature = inputs.feature;
            if (feature === CommandAndResponseOptionItem.id) {
              // command and response bot
              appManifest.bots = appManifest.bots.concat(BOTS_TPL_FOR_COMMAND_AND_RESPONSE_V3);
            } else if (feature === NotificationOptionItem.id) {
              // notification
              appManifest.bots = appManifest.bots.concat(BOTS_TPL_FOR_NOTIFICATION_V3);
            } else {
              // legacy bot
              appManifest.bots = appManifest.bots.concat(BOTS_TPL_V3);
            }
          }
        }
        break;
      case "MessageExtension":
        appManifest.composeExtensions = appManifest.composeExtensions || [];
        if (capability.snippet) {
          appManifest.composeExtensions.push(capability.snippet);
        } else {
          if (capability.existingApp) {
            appManifest.composeExtensions = appManifest.composeExtensions.concat(
              COMPOSE_EXTENSIONS_TPL_EXISTING_APP
            );
          } else {
            appManifest.composeExtensions =
              appManifest.composeExtensions.concat(COMPOSE_EXTENSIONS_TPL_V3);
          }
        }
        break;
      case "WebApplicationInfo":
        if (capability.snippet) {
          appManifest.webApplicationInfo = capability.snippet;
        } else {
          appManifest.webApplicationInfo = WEB_APPLICATION_INFO_V3;
        }
        break;
    }
  }
  await writeAppManifest(appManifest, inputs.projectPath);
  return ok(undefined);
}
