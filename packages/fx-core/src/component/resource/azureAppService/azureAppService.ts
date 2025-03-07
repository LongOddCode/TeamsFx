// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Action,
  ContextV3,
  FxError,
  InputsWithProjectPath,
  IProgressHandler,
  MaybePromise,
  ok,
  ProvisionContextV3,
  ResourceOutputs,
  Result,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import { azureWebSiteDeploy } from "../../../common/azure-hosting/utils";
import * as utils from "../../../plugins/resource/bot/utils/common";
import { getLanguage, getRuntime } from "../../../plugins/resource/bot/v2/mapping";
import {
  CheckThrowSomethingMissing,
  PackDirectoryExistenceError,
  PreconditionError,
} from "./errors";
import { AzureResource } from "./../azureResource";
import { Messages } from "./messages";
import { Plans, ProgressMessages, ProgressTitles } from "../../messages";
export abstract class AzureAppService extends AzureResource {
  abstract readonly name: string;
  abstract readonly alias: string;
  abstract readonly displayName: string;
  abstract readonly bicepModuleName: string;
  abstract readonly outputs: ResourceOutputs;
  abstract readonly finalOutputKeys: string[];
  generateBicep(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    this.getTemplateContext = (context, inputs) => {
      const configs: string[] = [];
      configs.push(getRuntime(getLanguage(context.projectSetting.programmingLanguage)));
      this.templateContext.configs = configs;
      return this.templateContext;
    };
    return super.generateBicep(context, inputs);
  }
  deploy(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: Action = {
      name: `${this.name}.deploy`,
      type: "function",
      enableProgressBar: true,
      progressTitle: ProgressTitles.deploying(this.displayName, inputs.scenario),
      progressSteps: 2,
      plan: (context: ContextV3, inputs: InputsWithProjectPath) => {
        const deployDir = path.resolve(inputs.projectPath, inputs.folder ?? "");
        return ok([Plans.deploy(this.displayName, deployDir)]);
      },
      execute: async (
        context: ContextV3,
        inputs: InputsWithProjectPath,
        progress?: IProgressHandler
      ) => {
        const ctx = context as ProvisionContextV3;
        // Preconditions checking.
        if (!inputs.projectPath || !inputs.artifactFolder) {
          throw new PreconditionError(this.alias, Messages.WorkingDirIsMissing, []);
        }
        const publishDir = path.resolve(inputs.projectPath, inputs.artifactFolder);
        const packDirExisted = await fs.pathExists(publishDir);
        if (!packDirExisted) {
          throw new PackDirectoryExistenceError(this.alias);
        }

        const state = ctx.envInfo.state[parent.name];
        const resourceId = CheckThrowSomethingMissing(
          this.alias,
          this.outputs.resourceId.key,
          state[this.outputs.resourceId.key]
        );
        await progress?.next(ProgressMessages.packingCode);
        const zipBuffer = await utils.zipFolderAsync(publishDir, "");

        await azureWebSiteDeploy(
          resourceId,
          ctx.tokenProvider,
          zipBuffer,
          context.logProvider,
          progress
        );
        return ok([Plans.deploy(this.displayName, publishDir)]);
      },
    };
    return ok(action);
  }
}
