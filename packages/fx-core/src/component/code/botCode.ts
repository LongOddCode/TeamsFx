// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  ok,
  Result,
  Action,
  ContextV3,
  MaybePromise,
  ProjectSettingsV3,
  SourceCodeProvider,
  InputsWithProjectPath,
  IProgressHandler,
} from "@microsoft/teamsfx-api";
import { merge } from "lodash";
import * as path from "path";
import "reflect-metadata";
import { Service } from "typedi";
import {
  genTemplateRenderReplaceFn,
  ScaffoldAction,
  ScaffoldActionName,
  ScaffoldContext,
  scaffoldFromTemplates,
} from "../../common/template-utils/templatesActions";
import {
  DEFAULT_DOTNET_FRAMEWORK,
  TemplateProjectsConstants,
} from "../../plugins/resource/bot/constants";
import { ProgrammingLanguage } from "../../plugins/resource/bot/enums/programmingLanguage";
import { Commands, CommonStrings } from "../../plugins/resource/bot/resources/strings";
import { TemplateZipFallbackError, UnzipError } from "../../plugins/resource/bot/v3/error";
import { ComponentNames } from "../constants";
import { getComponent } from "../workflow";
import * as utils from "../../plugins/resource/bot/utils/common";
import * as fs from "fs-extra";
import { CommandExecutionError } from "../../plugins/resource/bot/errors";
import { CoreQuestionNames } from "../../core/question";
import { convertToAlphanumericOnly } from "../../common/utils";
import { telemetryHelper } from "../../plugins/resource/bot/utils/telemetry-helper";
import { commonTelemetryPropsForBot } from "../resource/botService";
import { Plans, ProgressMessages, ProgressTitles } from "../messages";
/**
 * bot scaffold plugin
 */
@Service("bot-code")
export class BotCodeProvider implements SourceCodeProvider {
  name = "bot-code";
  generate(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "bot-code.generate",
      type: "function",
      enableProgressBar: true,
      progressTitle: ProgressTitles.scaffoldBot,
      progressSteps: 1,
      enableTelemetry: true,
      telemetryProps: commonTelemetryPropsForBot(context),
      telemetryComponentName: "fx-resource-bot",
      telemetryEventName: "scaffold",
      errorHandler: (e, t) => {
        telemetryHelper.fillAppStudioErrorProperty(e, t);
        return e as FxError;
      },
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        const language =
          inputs?.["programming-language"] ||
          context.projectSetting.programmingLanguage ||
          "javascript";
        const folder =
          inputs.folder ?? (language === "csharp" ? "" : CommonStrings.BOT_WORKING_DIR_NAME);
        return ok([Plans.scaffold("bot", path.join(inputs.projectPath, folder))]);
      },
      execute: async (
        context: ContextV3,
        inputs: InputsWithProjectPath,
        progress?: IProgressHandler
      ) => {
        const projectSettings = context.projectSetting as ProjectSettingsV3;
        const appName = projectSettings.appName;
        const language =
          inputs?.["programming-language"] ||
          context.projectSetting.programmingLanguage ||
          "javascript";
        const botFolder =
          inputs.folder ?? (language === "csharp" ? "" : CommonStrings.BOT_WORKING_DIR_NAME);
        const group_name = TemplateProjectsConstants.GROUP_NAME_BOT;
        const lang = convertToLangKey(language);
        const workingDir = path.join(inputs.projectPath, botFolder);
        const safeProjectName =
          inputs[CoreQuestionNames.SafeProjectName] ?? convertToAlphanumericOnly(appName);

        await progress?.next(ProgressMessages.scaffoldBot);
        for (const scenario of inputs.scenarios as string[]) {
          await scaffoldFromTemplates({
            group: group_name,
            lang: lang,
            scenario: scenario,
            dst: workingDir,
            fileDataReplaceFn: genTemplateRenderReplaceFn({
              ProjectName: appName,
              SafeProjectName: safeProjectName,
            }),
            fileNameReplaceFn: (name: string, data: Buffer) =>
              name.replace(/ProjectName/, appName).replace(/\.tpl/, ""),
            onActionError: async (
              action: ScaffoldAction,
              context: ScaffoldContext,
              error: Error
            ) => {
              switch (action.name) {
                case ScaffoldActionName.FetchTemplatesUrlWithTag:
                case ScaffoldActionName.FetchTemplatesZipFromUrl:
                  break;
                case ScaffoldActionName.FetchTemplateZipFromLocal:
                  throw new TemplateZipFallbackError();
                case ScaffoldActionName.Unzip:
                  throw new UnzipError(context.dst);
                default:
                  throw new Error(error.message);
              }
            },
          });
        }
        return ok([Plans.scaffold("bot", path.join(inputs.projectPath, botFolder))]);
      },
    };
    return ok(action);
  }
  build(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: "bot-code.build",
      type: "function",
      enableProgressBar: true,
      progressTitle: ProgressTitles.buildingBot,
      progressSteps: 1,
      enableTelemetry: true,
      telemetryProps: commonTelemetryPropsForBot(context),
      telemetryComponentName: "fx-resource-bot",
      telemetryEventName: "build",
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        const teamsBot = getComponent(context.projectSetting, ComponentNames.TeamsBot);
        if (!teamsBot) return ok([]);
        const packDir = teamsBot?.folder;
        if (!packDir) return ok([]);
        return ok([Plans.buildProject(packDir)]);
      },
      execute: async (
        context: ContextV3,
        inputs: InputsWithProjectPath,
        progress?: IProgressHandler
      ) => {
        const teamsBot = getComponent(context.projectSetting, ComponentNames.TeamsBot);
        if (!teamsBot) return ok([]);
        const packDir = path.join(inputs.projectPath, teamsBot.folder!);
        const language = context.projectSetting.programmingLanguage || "javascript";
        await progress?.next(ProgressMessages.buildingBot);
        if (language === ProgrammingLanguage.TypeScript) {
          //Typescript needs tsc build before deploy because of windows app server. other languages don"t need it.
          try {
            await utils.execute("npm install", packDir);
            await utils.execute("npm run build", packDir);
            merge(teamsBot, { build: true, artifactFolder: teamsBot.folder });
          } catch (e) {
            throw new CommandExecutionError(
              `${Commands.NPM_INSTALL}, ${Commands.NPM_BUILD}`,
              packDir,
              e
            );
          }
        } else if (language === ProgrammingLanguage.JavaScript) {
          try {
            // fail to npm install @microsoft/teamsfx on azure web app, so pack it locally.
            await utils.execute("npm install", packDir);
            merge(teamsBot, { build: true, artifactFolder: teamsBot.folder });
          } catch (e) {
            throw new CommandExecutionError(`${Commands.NPM_INSTALL}`, packDir, e);
          }
        } else if (language === ProgrammingLanguage.Csharp) {
          const projectFileName = `${context.projectSetting.appName}.csproj`;
          const framework = await BotCodeProvider.getFrameworkVersion(
            path.join(packDir, projectFileName)
          );
          await utils.execute(`dotnet publish --configuration Release`, packDir);
          const artifactFolder = path.join(".", "bin", "Release", framework, "publish");
          merge(teamsBot, { build: true, artifactFolder: artifactFolder });
        }
        return ok([Plans.buildProject(packDir)]);
      },
    };
    return ok(action);
  }

  /**
   * read dotnet framework version from project file
   * @param projectFilePath project base folder
   */
  private static async getFrameworkVersion(projectFilePath: string): Promise<string> {
    try {
      const reg = /(?<=<TargetFramework>)(.*)(?=<)/gim;
      const content = await fs.readFile(projectFilePath, "utf8");
      const framework = content.match(reg);
      if (framework?.length) {
        return framework[0].trim();
      }
    } catch {}
    return DEFAULT_DOTNET_FRAMEWORK;
  }
}

export function convertToLangKey(programmingLanguage: string): string {
  switch (programmingLanguage) {
    case "javascript": {
      return "js";
    }
    case "typescript": {
      return "ts";
    }
    case "csharp": {
      return "csharp";
    }
    default: {
      return "js";
    }
  }
}
