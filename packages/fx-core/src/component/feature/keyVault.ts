// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Action,
  ContextV3,
  Effect,
  err,
  FunctionAction,
  FxError,
  InputsWithProjectPath,
  MaybePromise,
  ok,
  Result,
} from "@microsoft/teamsfx-api";
import "reflect-metadata";
import { Service } from "typedi";
import "../connection/azureWebAppConfig";
import { ComponentNames } from "../constants";
import { Plans } from "../messages";
import "../resource/azureSql";
import "../resource/identity";
import { generateConfigBiceps } from "../utils";
import { getComponent, runActionByName } from "../workflow";

@Service("key-vault-feature")
export class KeyVaultFeature {
  name = "key-vault-feature";

  /**
   * 1. config keyVault
   * 2. add keyVault provision bicep
   * 3. re-generate resources that connect to key-vault
   * 4. persist bicep
   */
  add(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): MaybePromise<Result<Action | undefined, FxError>> {
    const action: FunctionAction = {
      name: "key-vault-feature.add",
      type: "function",
      execute: async (context: ContextV3, inputs: InputsWithProjectPath) => {
        const projectSettings = context.projectSetting;
        const keyVaultComponent = getComponent(projectSettings, ComponentNames.KeyVault);
        if (keyVaultComponent) return ok([]);
        const effects: Effect[] = [];

        // config
        projectSettings.components.push({
          name: ComponentNames.KeyVault,
          connections: [ComponentNames.Identity],
          provision: true,
        });
        effects.push(Plans.addFeature("key-vault"));

        // key-vault provision bicep
        {
          const res = await runActionByName("key-vault.generateBicep", context, inputs);
          if (res.isErr()) return err(res.error);
          effects.push("generate key-vault provision bicep");
        }

        // generate config bicep
        {
          const res = await generateConfigBiceps(context, inputs);
          if (res.isErr()) return err(res.error);
          effects.push("update config biceps");
        }

        return ok(effects);
      },
    };
    return ok(action);
  }
}
